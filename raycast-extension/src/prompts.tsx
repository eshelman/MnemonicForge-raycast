/* eslint-disable @raycast/prefer-title-case */

import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  popToRoot,
  showToast,
} from "@raycast/api";
import { stat } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { useEffect, useMemo, useState } from "react";
import { gatherContext } from "./context-gatherer";
import { summarizeContext } from "./context-summary";
import { openInExternalEditor } from "./editor-utils";
import { sendPromptToOpenAI, SendPromptResult } from "./openai-provider";
import { PromptSearchResult } from "./prompt-index";
import { PromptParameter, PromptRecord } from "./prompt-types";
import { RenderedPrompt, renderPrompt } from "./prompt-renderer";
import { promptHasParameters } from "./prompt-utils";
import { getExtensionPreferences, ExtensionPreferences } from "./preferences";
import { usePromptIndex } from "./use-prompt-index";

type ClipboardCategory = "empty" | "url" | "file" | "text";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

interface ClipboardSnapshot {
  category: ClipboardCategory;
  text?: string;
  file?: string;
}

interface RunPromptFormValues extends Form.Values {
  [key: string]: unknown;
}

function sanitizeContextForLog(
  context: Record<string, unknown>,
  maxLength = 200,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string") {
      sanitized[key] =
        value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

type ClipboardPastePayload = Parameters<typeof Clipboard.paste>[0];

/**
 * Creates a Clipboard.Content for file copying.
 * Raycast's Clipboard API supports { file: URL } but types are incomplete.
 */
function createFileClipboardContent(fileURL: URL): Clipboard.Content {
  return { file: fileURL } as Clipboard.Content;
}

function formatCopySuccessMessage(attachmentCount: number): string {
  if (!attachmentCount) {
    return "Copied to clipboard";
  }

  return attachmentCount === 1
    ? "Copied with 1 attachment"
    : `Copied with ${attachmentCount} attachments`;
}

async function attemptPaste(content: ClipboardPastePayload): Promise<void> {
  try {
    await Clipboard.paste(content);
  } catch (error) {
    console.warn("Paste failed", error);
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAttachmentPaths(record: PromptRecord): Promise<string[]> {
  const entries = record.frontMatter?.files_to_paste ?? [];
  if (!entries.length) {
    return [];
  }

  const root = path.resolve(record.rootPath);
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const entry of entries) {
    const trimmed = entry?.trim();
    if (!trimmed) {
      continue;
    }

    const candidate = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(root, trimmed);

    const relativeToRoot = path.relative(root, candidate);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      throw new Error(
        `Attachment path '${trimmed}' must stay within the prompts directory`,
      );
    }

    if (seen.has(candidate)) {
      continue;
    }

    const fileStats = await stat(candidate).catch(() => null);
    if (!fileStats) {
      throw new Error(`Attachment file not found: ${trimmed}`);
    }

    if (!fileStats.isFile()) {
      throw new Error(`Attachment must be a file: ${trimmed}`);
    }

    seen.add(candidate);
    resolved.push(candidate);
  }

  return resolved;
}

async function copyPromptToClipboard({
  record,
  text,
  pasteAfterCopy,
  existingFiles = [],
}: {
  record: PromptRecord;
  text: string;
  pasteAfterCopy: boolean;
  existingFiles?: string[];
}): Promise<string[]> {
  const attachmentsFromPrompt = await resolveAttachmentPaths(record);

  const combinedAttachments = new Map<string, string>();
  const pushAttachment = async (filePath: string) => {
    if (!filePath.trim()) {
      return;
    }

    const input = filePath.trim();
    let absolutePath: string;
    if (input.startsWith("file://")) {
      try {
        absolutePath = fileURLToPath(input);
      } catch {
        absolutePath = input.replace(/^file:\/\//i, "");
      }
    } else {
      absolutePath = input;
    }

    const normalized = path.resolve(absolutePath);
    if (combinedAttachments.has(normalized)) {
      return;
    }

    const fileStats = await stat(normalized).catch(() => null);
    if (!fileStats || !fileStats.isFile()) {
      throw new Error(`Attachment file not found: ${filePath}`);
    }

    combinedAttachments.set(normalized, normalized);
  };

  for (const attachment of attachmentsFromPrompt) {
    await pushAttachment(attachment);
  }

  for (const existing of existingFiles) {
    if (!existing?.trim()) {
      continue;
    }
    await pushAttachment(existing.trim());
  }

  const attachments = [...combinedAttachments.values()];

  await Clipboard.copy(text);
  await sleep(50);
  if (pasteAfterCopy) {
    await attemptPaste(text);
    await sleep(100);
  }

  if (!attachments.length) {
    return attachments;
  }

  try {
    for (const attachment of attachments) {
      const fileURL = pathToFileURL(attachment);
      const fileContent = createFileClipboardContent(fileURL);
      try {
        await Clipboard.copy(fileContent);
        await sleep(75);
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? `Failed to copy attachment '${path.basename(attachment)}': ${error.message}`
            : `Failed to copy attachment '${path.basename(attachment)}'`,
        );
      }

      if (pasteAfterCopy) {
        await attemptPaste(fileContent);
        await sleep(150);
      }
    }
  } finally {
    await sleep(100);
    await Clipboard.copy(text);
  }

  return attachments;
}

export default function PromptsCommand() {
  const preferences = getExtensionPreferences();
  const [searchText, setSearchText] = useState("");
  const [clipboardSnapshot, setClipboardSnapshot] = useState<ClipboardSnapshot>({
    category: "empty",
  });
  const [clipboardFilter, setClipboardFilter] = useState<"none" | "url" | "file">(
    "none",
  );

  const {
    promptsPath,
    pasteAfterCopy,
    contextDefaultClipboard,
    contextDefaultSelection,
    contextDefaultApp,
    contextDefaultDate,
    externalEditorCommand,
  } = preferences;

  const { isLoading, error, records, hasIndex, search } =
    usePromptIndex(promptsPath);

  useEffect(() => {
    let cancelled = false;

    async function analyzeClipboard() {
      try {
        const content = await Clipboard.read();
        if (cancelled) {
          return;
        }

        const filePath = content.file?.trim();
        const text = content.text?.trim();

        if (filePath) {
          setClipboardSnapshot({ category: "file", file: filePath });
          setClipboardFilter("file");
          return;
        }

        if (text) {
          if (isLikelyUrl(text)) {
            setClipboardSnapshot({ category: "url", text });
            setClipboardFilter("url");
            return;
          }

          setClipboardSnapshot({ category: "text", text });
          setClipboardFilter("none");
          return;
        }

        setClipboardSnapshot({ category: "empty" });
        setClipboardFilter("none");
      } catch (caught) {
        console.warn("Clipboard analysis failed", caught);
        if (!cancelled) {
          setClipboardSnapshot({ category: "empty" });
          setClipboardFilter("none");
        }
      }
    }

    analyzeClipboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (error && promptsPath) {
      showToast({
        style: Toast.Style.Failure,
        title: "Prompt index unavailable",
        message: error,
      });
    }
  }, [error, promptsPath]);

  const results: PromptSearchResult[] = useMemo(() => {
    if (!hasIndex || error) {
      return [];
    }

    const query = searchText.trim();
    if (query) {
      return search(query);
    }

    let baseRecords = records;
    if (clipboardFilter === "url") {
      const filtered = records.filter(promptRequestsUrl);
      if (filtered.length) {
        baseRecords = filtered;
      }
    } else if (clipboardFilter === "file") {
      const filtered = records.filter(promptRequestsFile);
      if (filtered.length) {
        baseRecords = filtered;
      }
    }

    return baseRecords.map((record, index) => ({ record, score: index }));
  }, [hasIndex, error, records, searchText, search, clipboardFilter]);

  const searchPlaceholder = useMemo(() => {
    if (searchText.trim()) {
      return "Search prompts";
    }

    switch (clipboardFilter) {
      case "url":
        return "Prompts requesting a URL";
      case "file":
        return "Prompts expecting a file";
      default:
        return "Search prompts";
    }
  }, [clipboardFilter, searchText]);

  const handleSearchTextChange = (value: string) => {
    setSearchText(value);

    if (value.trim()) {
      setClipboardFilter("none");
    } else {
      if (clipboardSnapshot.category === "url") {
        setClipboardFilter("url");
      } else if (clipboardSnapshot.category === "file") {
        setClipboardFilter("file");
      } else {
        setClipboardFilter("none");
      }
    }
  };

  const handleQuickRender = async (record: PromptRecord) => {
    if (!record.frontMatter || record.validationIssues.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Prompt metadata incomplete",
      });
      return;
    }

    const formValues: RunPromptFormValues = {};
    const parameters = record.frontMatter.parameters ?? [];
    for (const parameter of parameters) {
      const fieldId = fieldNameForParameter(parameter);
      if (parameter.default !== undefined) {
        formValues[fieldId] = parameter.default;
      }
    }

    if (
      (clipboardSnapshot.category === "text" ||
        clipboardSnapshot.category === "url") &&
      clipboardSnapshot.text &&
      parameters.length
    ) {
      const firstParameter = parameters[0];
      if (parameterSupportsClipboardPrefill(firstParameter)) {
        const fieldId = fieldNameForParameter(firstParameter);
        const existing = formValues[fieldId];
        if (
          typeof existing !== "string" ||
          !existing.trim()
        ) {
          formValues[fieldId] = clipboardSnapshot.text.trim();
        }
      }
    }

    const { collected, missing, invalid } = collectParameters(record, formValues);
    if (missing.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Quick render needs inputs",
        message: missing.map((parameter) => parameter.name).join(", "),
      });
      return;
    }
    if (invalid.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid input",
        message: invalid[0].message,
      });
      return;
    }

    const contextPreferences = {
      clipboard: contextDefaultClipboard,
      selection: contextDefaultSelection,
      application: contextDefaultApp,
      date: contextDefaultDate,
    };

    try {
      const promptContext = await gatherContext(contextPreferences);
      const rendered = renderPrompt(record, {
        parameters: collected,
        context: promptContext,
      });

      const attachments = await copyPromptToClipboard({
        record,
        text: rendered.output,
        pasteAfterCopy,
        existingFiles:
          clipboardSnapshot.category === "file" && clipboardSnapshot.file
            ? [clipboardSnapshot.file]
            : [],
      });

      await showToast({
        style: Toast.Style.Success,
        title: "Prompt ready",
        message: formatCopySuccessMessage(attachments.length),
      });

      await popToRoot({ clearSearchBar: true });

      if (preferences.debugLog) {
        console.debug("Prompt quick render", {
          promptId: record.id,
          context: sanitizeContextForLog(promptContext),
          attachments,
        });
      }
    } catch (caught) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message: getErrorMessage(caught, "Failed to render prompt"),
      });
    }
  };

  return (
    <List
      searchBarPlaceholder={searchPlaceholder}
      onSearchTextChange={handleSearchTextChange}
      isLoading={isLoading}
      throttle
    >
      {results.length === 0 ? (
        <List.EmptyView
          title={error ? "Prompt index unavailable" : "No prompts found"}
          description={
            error
              ? error
              : promptsPath
                ? "Add prompt files to your library to see them here."
                : "Configure the Prompts Folder preference."
          }
          icon={error ? Icon.Warning : Icon.TextDocument}
        />
      ) : (
        results.map(({ record }) => (
          <List.Item
            key={record.id}
            icon={record.validationIssues.length ? Icon.Warning : Icon.Document}
            title={record.frontMatter?.title ?? record.relativePath}
            subtitle={record.frontMatter?.description}
            accessories={
              record.tags.length
                ? [{ text: record.tags.join(", ") }]
                : undefined
            }
            detail={
              <List.Item.Detail
                markdown={`**Path:** ${record.relativePath}\n\n${record.excerpt || "(empty file)"}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Last Modified"
                      text={record.modifiedAt.toLocaleString()}
                    />
                    {record.tags.length ? (
                      <List.Item.Detail.Metadata.TagList title="Tags">
                        {record.tags.map((tag) => (
                          <List.Item.Detail.Metadata.TagList.Item
                            key={tag}
                            text={tag}
                          />
                        ))}
                      </List.Item.Detail.Metadata.TagList>
                    ) : null}
                    {record.validationIssues.length ? (
                      <List.Item.Detail.Metadata.Separator />
                    ) : null}
                    {record.validationIssues.map((issue, index) => (
                      <List.Item.Detail.Metadata.Label
                        key={`${issue.message}-${index}`}
                        title="Validation"
                        text={
                          issue.path
                            ? `${issue.message} (${issue.path})`
                            : issue.message
                        }
                      />
                    ))}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                {promptHasParameters(record) ? (
                  <>
                    <Action.Push
                      title="Configure Prompt"
                      target={
                        <PromptFormView
                          preferences={preferences}
                          initialPromptId={record.id}
                          clipboardSnapshot={clipboardSnapshot}
                        />
                      }
                    />
                    <Action
                      title="Quick Render & Copy"
                      icon={Icon.Clipboard}
                      shortcut={{ modifiers: ["ctrl"], key: "enter" }}
                      onAction={() => handleQuickRender(record)}
                    />
                  </>
                ) : (
                  <>
                    <Action
                      title="Render & Copy"
                      icon={Icon.Clipboard}
                      onAction={() => handleQuickRender(record)}
                    />
                    <Action.Push
                      title="Open Prompt Options"
                      target={
                        <PromptFormView
                          preferences={preferences}
                          initialPromptId={record.id}
                          clipboardSnapshot={clipboardSnapshot}
                        />
                      }
                    />
                  </>
                )}
                {externalEditorCommand?.trim() ? (
                  <Action
                    title="Open In External Editor"
                    icon={Icon.Pencil}
                    onAction={async () =>
                      openInExternalEditor(
                        record.filePath,
                        externalEditorCommand,
                      )
                    }
                  />
                ) : (
                  <Action.Open title="Open Prompt" target={record.filePath} />
                )}
                <Action.ShowInFinder
                  title="Reveal in Finder"
                  path={record.filePath}
                />
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function PromptFormView({
  preferences,
  initialPromptId,
  clipboardSnapshot,
}: {
  preferences: ExtensionPreferences;
  initialPromptId: string;
  clipboardSnapshot: ClipboardSnapshot;
}) {
  const {
    promptsPath,
    pasteAfterCopy,
    enableSend,
    contextDefaultClipboard,
    contextDefaultSelection,
    contextDefaultApp,
    contextDefaultDate,
    externalEditorCommand,
  } = preferences;

  const { isLoading, records, hasIndex } = usePromptIndex(promptsPath);

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(
    initialPromptId,
  );
  const [lastRendered, setLastRendered] = useState<
    (RenderedPrompt & { renderedAt: Date }) | null
  >(null);
  const [lastSendResult, setLastSendResult] = useState<{
    prompt: RenderedPrompt & { renderedAt: Date };
    response: SendPromptResult;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lastContextSummary, setLastContextSummary] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!records.length) {
      setSelectedPromptId(null);
      return;
    }

    if (
      selectedPromptId &&
      records.some((record) => record.id === selectedPromptId)
    ) {
      return;
    }

    if (
      initialPromptId &&
      records.some((record) => record.id === initialPromptId)
    ) {
      setSelectedPromptId(initialPromptId);
      return;
    }

    setSelectedPromptId(records[0]?.id ?? null);
  }, [records, selectedPromptId, initialPromptId]);

  const selectedRecord: PromptRecord | undefined = useMemo(
    () => records.find((record) => record.id === selectedPromptId),
    [records, selectedPromptId],
  );

  const parameterFields = selectedRecord?.frontMatter?.parameters ?? [];
  const firstFieldPrefill = useMemo(() => {
    if (
      clipboardSnapshot.category === "text" ||
      clipboardSnapshot.category === "url"
    ) {
      return clipboardSnapshot.text?.trim() || undefined;
    }
    return undefined;
  }, [clipboardSnapshot]);
  const promptTitle = selectedRecord
    ? (selectedRecord.frontMatter?.title ?? selectedRecord.relativePath)
    : "No prompt selected";
  const promptSummary = selectedRecord
    ? selectedRecord.frontMatter?.description || selectedRecord.excerpt || ""
    : "Select a prompt from the list to configure parameters.";
  const promptContent =
    selectedRecord?.content ??
    "Select a prompt from the list to preview its content.";

  const formKey = selectedPromptId ?? "no-prompt";

  const prepareRender = async (values: RunPromptFormValues) => {
    const record = selectedRecord;

    if (!record) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Select a prompt first",
      });
      return;
    }

    if (!record.frontMatter || record.validationIssues.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Prompt metadata incomplete",
      });
      return;
    }

    const { collected, missing, invalid } = collectParameters(record, values);

    if (missing.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing required inputs",
        message: missing.map((parameter) => parameter.name).join(", "),
      });
      return;
    }

    if (invalid.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid input",
        message: invalid[0].message,
      });
      return;
    }

    const contextPreferences = {
      clipboard: contextDefaultClipboard,
      selection: contextDefaultSelection,
      application: contextDefaultApp,
      date: contextDefaultDate,
    };

    const promptContext = await gatherContext(contextPreferences);
    const rendered = renderPrompt(record, {
      parameters: collected,
      context: promptContext,
    });

    setLastContextSummary(summarizeContext(promptContext));

    return { record, rendered, collected, promptContext };
  };

  const handleSubmit = async (
    values: RunPromptFormValues,
    options: { copy: boolean; paste: boolean },
  ) => {
    try {
      const prepared = await prepareRender(values);
      if (!prepared) {
        return;
      }

      const timestamped = { ...prepared.rendered, renderedAt: new Date() };
      setLastRendered(timestamped);
      setLastSendResult(null);

      let attachments: string[] = [];
      if (options.copy) {
        attachments = await copyPromptToClipboard({
          record: prepared.record,
          text: timestamped.output,
          pasteAfterCopy: options.paste,
          existingFiles:
            clipboardSnapshot.category === "file" && clipboardSnapshot.file
              ? [clipboardSnapshot.file]
              : [],
        });
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Prompt ready",
        message: options.copy
          ? formatCopySuccessMessage(attachments.length)
          : "Rendered without copying",
      });

      await popToRoot({ clearSearchBar: true });

      if (preferences.debugLog) {
        console.debug("Prompt rendered", {
          promptId: prepared.record.id,
          context: sanitizeContextForLog(prepared.promptContext),
          attachments,
        });
      }
    } catch (caught) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message: getErrorMessage(caught, "Failed to render prompt"),
      });
    }
  };

  const handleSend = async (values: RunPromptFormValues) => {
    if (isSending) {
      await showToast({
        style: Toast.Style.Animated,
        title: "Send already in progress",
      });
      return;
    }

    setIsSending(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Sending to OpenAI",
    });
    try {
      const prepared = await prepareRender(values);
      if (!prepared) {
        toast.hide();
        return;
      }

      const timestamped = { ...prepared.rendered, renderedAt: new Date() };
      setLastRendered(timestamped);

      const response = await sendPromptToOpenAI({
        prompt: timestamped.output,
        frontMatter: prepared.record.frontMatter!,
        context: prepared.promptContext,
      });

      setLastSendResult({ prompt: timestamped, response });

      toast.style = Toast.Style.Success;
      toast.title = "Sent to OpenAI";
      toast.message = response.tokensUsed
        ? `${response.tokensUsed} tokens`
        : undefined;
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Send failed";
      toast.message = getErrorMessage(caught, "Failed to send prompt");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Form
      key={formKey}
      isLoading={isLoading && !hasIndex}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Render & Copy"
            onSubmit={(values) =>
              handleSubmit(values, { copy: true, paste: pasteAfterCopy })
            }
          />
          <Action.SubmitForm
            title="Render (Copy Only)"
            shortcut={{ modifiers: ["opt"], key: "enter" }}
            onSubmit={(values) =>
              handleSubmit(values, { copy: true, paste: false })
            }
          />
          <Action.SubmitForm
            title="Render Without Copy"
            shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
            onSubmit={(values) =>
              handleSubmit(values, { copy: false, paste: false })
            }
          />
          {enableSend ? (
            isSending ? (
              <Action.SubmitForm
                title="Sending…"
                shortcut={{ modifiers: ["cmd"], key: "enter" }}
                onSubmit={handleSend}
              />
            ) : (
              <Action.SubmitForm
                title="Send With OpenAI"
                shortcut={{ modifiers: ["cmd"], key: "enter" }}
                onSubmit={handleSend}
              />
            )
          ) : null}
          {selectedRecord ? (
            externalEditorCommand?.trim() ? (
              <Action
                title="Open In External Editor"
                icon={Icon.Pencil}
                onAction={async () =>
                  openInExternalEditor(
                    selectedRecord.filePath,
                    externalEditorCommand,
                  )
                }
              />
            ) : (
              <Action.Open
                title="Open Prompt"
                target={selectedRecord.filePath}
              />
            )
          ) : null}
          {selectedRecord ? (
            <Action.ShowInFinder
              title="Reveal in Finder"
              path={selectedRecord.filePath}
            />
          ) : null}
          {lastRendered ? (
            <Action.CopyToClipboard
              title="Copy Last Output"
              content={lastRendered.output}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          ) : null}
          {lastRendered ? (
            <Action.Push
              title="Preview Last Output"
              shortcut={{ modifiers: ["cmd"], key: "y" }}
              target={<PromptPreview rendered={lastRendered} />}
            />
          ) : null}
          {lastSendResult ? (
            <Action.CopyToClipboard
              title="Copy Last Response"
              content={lastSendResult.response.output}
              shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            />
          ) : null}
          {lastSendResult ? (
            <Action.Push
              title="Preview Last Response"
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              target={<SendResultPreview result={lastSendResult} />}
            />
          ) : null}
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Prompt" text={promptTitle} />
      {promptSummary ? (
        <Form.Description title="Summary" text={promptSummary} />
      ) : null}

      {selectedRecord?.validationIssues.length ? (
        <Form.Description
          title="Metadata Issues"
          text={selectedRecord.validationIssues
            .map((issue) => issue.message)
            .join("\n")}
        />
      ) : null}

      {lastContextSummary ? (
        <Form.Description title="Context" text={lastContextSummary} />
      ) : null}

      <Form.Separator />

      {parameterFields.length === 0 ? (
        <Form.Description
          title="Parameters"
          text="This prompt does not declare any parameters."
        />
      ) : (
        parameterFields.map((parameter, index) =>
          renderParameterField(parameter, {
            index,
            prefill: index === 0 ? firstFieldPrefill : undefined,
          }),
        )
      )}

      <Form.Separator />

      <Form.TextArea
        id="promptContentPreview"
        title="Prompt Content"
        value={promptContent}
        onChange={() => {}}
      />

      {lastRendered || lastSendResult ? (
        <>
          <Form.Separator />
          {lastRendered ? (
            <Form.Description
              title="Last Render"
              text={`Rendered ${lastRendered.renderedAt.toLocaleTimeString()} — ${lastRendered.metadata.title}`}
            />
          ) : null}
          {lastSendResult ? (
            <Form.Description
              title="Last Response"
              text={
                lastSendResult.response.tokensUsed
                  ? `Received ${lastSendResult.response.tokensUsed} tokens from OpenAI.`
                  : "Received response from OpenAI."
              }
            />
          ) : null}
        </>
      ) : null}
    </Form>
  );
}

interface ParameterValidationError {
  parameter: PromptParameter;
  message: string;
}

function collectParameters(
  record: PromptRecord,
  values: RunPromptFormValues,
): {
  collected: Record<string, unknown>;
  missing: PromptParameter[];
  invalid: ParameterValidationError[];
} {
  const parameters = record.frontMatter?.parameters ?? [];
  const collected: Record<string, unknown> = {};
  const missing: PromptParameter[] = [];
  const invalid: ParameterValidationError[] = [];

  for (const parameter of parameters) {
    const fieldId = fieldNameForParameter(parameter);
    const rawValue = values[fieldId];
    const normalized = normalizeParameterValue(parameter, rawValue);
    collected[parameter.name] = normalized;

    if (parameter.required) {
      const isEmpty =
        normalized === undefined ||
        normalized === null ||
        (typeof normalized === "string" && normalized.trim() === "") ||
        (Array.isArray(normalized) && normalized.length === 0);

      if (isEmpty) {
        missing.push(parameter);
        continue;
      }
    }

    // Validate regex pattern for string/text parameters
    if (
      parameter.regex &&
      (parameter.type === "string" || parameter.type === "text") &&
      typeof normalized === "string" &&
      normalized.trim()
    ) {
      try {
        const regex = new RegExp(parameter.regex);
        if (!regex.test(normalized)) {
          invalid.push({
            parameter,
            message: `${parameter.label ?? parameter.name} does not match required pattern`,
          });
        }
      } catch {
        // Invalid regex in schema - skip validation but log
        console.warn(`Invalid regex pattern for parameter ${parameter.name}: ${parameter.regex}`);
      }
    }
  }

  return { collected, missing, invalid };
}

function promptRequestsUrl(record: PromptRecord): boolean {
  if (promptPrefersClipboardType(record, "url")) {
    return true;
  }

  const parameters = record.frontMatter?.parameters ?? [];
  if (!parameters.length) {
    return false;
  }

  return parameters.some((parameter) =>
    parameterHints(parameter).some((hint) =>
      hint.includes("url") || hint.includes("link"),
    ),
  );
}

function promptRequestsFile(record: PromptRecord): boolean {
  if (promptPrefersClipboardType(record, "file")) {
    return true;
  }

  if (record.frontMatter?.requires_file) {
    return true;
  }

  const parameters = record.frontMatter?.parameters ?? [];
  if (!parameters.length) {
    return false;
  }

  const fileKeywords = ["file", "upload", "attachment", "document"];
  return parameters.some((parameter) =>
    parameterHints(parameter).some((hint) =>
      fileKeywords.some((keyword) => hint.includes(keyword)),
    ),
  );
}

function renderParameterField(
  parameter: PromptParameter,
  options: { index: number; prefill?: string },
) {
  const fieldId = fieldNameForParameter(parameter);
  const label = parameter.label ?? parameter.name;
  const title = parameter.required ? `${label} *` : label;
  const prefill = options.index === 0 ? options.prefill?.trim() : undefined;

  switch (parameter.type) {
    case "text": {
      const defaultValue = pickDefaultString(
        stringifyDefault(parameter.default),
        prefill,
      );
      return (
        <Form.TextArea
          key={fieldId}
          id={fieldId}
          title={title}
          placeholder={parameter.required ? "Required" : "Optional"}
          defaultValue={defaultValue}
        />
      );
    }
    case "enum": {
      if (!parameter.options?.length) {
        return renderFallbackTextField(fieldId, title, parameter);
      }
      const defaultValue = stringifyDefault(parameter.default);
      return (
        <Form.Dropdown
          key={fieldId}
          id={fieldId}
          title={title}
          defaultValue={defaultValue || undefined}
        >
          {parameter.options.map((option) => (
            <Form.Dropdown.Item key={option} value={option} title={option} />
          ))}
        </Form.Dropdown>
      );
    }
    case "boolean": {
      const defaultValue = Boolean(parameter.default);
      return (
        <Form.Checkbox
          key={fieldId}
          id={fieldId}
          label={title}
          defaultValue={defaultValue}
        />
      );
    }
    case "number": {
      const defaultValue = stringifyDefault(parameter.default);
      return (
        <Form.TextField
          key={fieldId}
          id={fieldId}
          title={title}
          placeholder={parameter.required ? "Required" : "Optional"}
          defaultValue={defaultValue}
        />
      );
    }
    case "date": {
      const defaultDate = dateFromDefault(parameter.default);
      return (
        <Form.DatePicker
          key={fieldId}
          id={fieldId}
          title={title}
          type={Form.DatePicker.Type.Date}
          defaultValue={defaultDate}
        />
      );
    }
    case "array": {
      const defaultValue = arrayDefault(parameter);
      return (
        <Form.TextArea
          key={fieldId}
          id={fieldId}
          title={title}
          placeholder={`Enter values separated by '${parameter.delimiter ?? ";"}'`}
          defaultValue={defaultValue}
        />
      );
    }
    default:
      return renderFallbackTextField(fieldId, title, parameter, prefill);
  }
}

function renderFallbackTextField(
  fieldId: string,
  title: string,
  parameter: PromptParameter,
  prefill?: string,
) {
  const defaultValue = pickDefaultString(
    stringifyDefault(parameter.default),
    prefill,
  );
  return (
    <Form.TextField
      key={fieldId}
      id={fieldId}
      title={title}
      placeholder={parameter.required ? "Required" : "Optional"}
      defaultValue={defaultValue}
    />
  );
}

function fieldNameForParameter(parameter: PromptParameter): string {
  return `param-${parameter.name}`;
}

function pickDefaultString(current: string, prefill?: string): string {
  if (prefill && !current.trim()) {
    return prefill;
  }

  return current || prefill || "";
}

function parameterSupportsClipboardPrefill(parameter: PromptParameter): boolean {
  return parameter.type === "text" || parameter.type === "string";
}

function promptPrefersClipboardType(
  record: PromptRecord,
  type: "text" | "url" | "file",
): boolean {
  return record.frontMatter?.preferred_clipboard_types?.includes(type) ?? false;
}

function parameterHints(parameter: PromptParameter): string[] {
  const hints = [parameter.name, parameter.label ?? ""];
  if (parameter.regex) {
    hints.push(parameter.regex);
  }
  return hints
    .filter(Boolean)
    .map((hint) => hint.toLowerCase());
}

function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  if (/^www\.[^\s]+$/i.test(trimmed)) {
    return true;
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
}

function stringifyDefault(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function arrayDefault(parameter: PromptParameter): string {
  const delimiter = parameter.delimiter ?? ";";
  if (Array.isArray(parameter.default)) {
    return parameter.default.join(`${delimiter} `);
  }
  if (typeof parameter.default === "string") {
    return parameter.default;
  }
  return "";
}

function dateFromDefault(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeParameterValue(
  parameter: PromptParameter,
  rawValue: unknown,
): unknown {
  switch (parameter.type) {
    case "boolean":
      return Boolean(rawValue);
    case "number": {
      if (typeof rawValue === "number") {
        return rawValue;
      }
      const numeric = Number(rawValue);
      return Number.isNaN(numeric) ? undefined : numeric;
    }
    case "date": {
      if (!rawValue) {
        return undefined;
      }
      if (rawValue instanceof Date) {
        return rawValue.toISOString();
      }
      const parsed = new Date(String(rawValue));
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    case "array": {
      if (!rawValue) {
        return [];
      }
      if (Array.isArray(rawValue)) {
        return rawValue;
      }
      const text = String(rawValue);
      const delimiter = parameter.delimiter ?? ";";
      return text
        .split(delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    default:
      return rawValue ?? "";
  }
}

function PromptPreview({ rendered }: { rendered: RenderedPrompt }) {
  const markdown = `# ${rendered.metadata.title}\n\n\`\`\`\n${rendered.output}\n\`\`\``;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          {rendered.metadata.description ? (
            <Detail.Metadata.Label
              title="Description"
              text={rendered.metadata.description}
            />
          ) : null}
          <Detail.Metadata.Label
            title="Source"
            text={rendered.metadata.sourcePath}
          />
          {rendered.metadata.tags.length ? (
            <Detail.Metadata.TagList title="Tags">
              {rendered.metadata.tags.map((tag) => (
                <Detail.Metadata.TagList.Item key={tag} text={tag} />
              ))}
            </Detail.Metadata.TagList>
          ) : null}
        </Detail.Metadata>
      }
    />
  );
}

function SendResultPreview({
  result,
}: {
  result: {
    prompt: RenderedPrompt & { renderedAt: Date };
    response: SendPromptResult;
  };
}) {
  const promptMarkdown = `## Prompt\n\n\`\`\`\n${result.prompt.output}\n\`\`\``;
  const responseMarkdown = result.response.output
    ? `## Response\n\n${result.response.output}`
    : "## Response\n\n_No content returned._";

  const markdown = `# ${result.prompt.metadata.title}\n\n${promptMarkdown}\n\n${responseMarkdown}`;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Sent"
            text={result.prompt.renderedAt.toLocaleString()}
          />
          {result.response.tokensUsed ? (
            <Detail.Metadata.Label
              title="Tokens"
              text={String(result.response.tokensUsed)}
            />
          ) : null}
          {result.prompt.metadata.tags.length ? (
            <Detail.Metadata.TagList title="Tags">
              {result.prompt.metadata.tags.map((tag) => (
                <Detail.Metadata.TagList.Item key={tag} text={tag} />
              ))}
            </Detail.Metadata.TagList>
          ) : null}
        </Detail.Metadata>
      }
    />
  );
}

/* eslint-enable @raycast/prefer-title-case */
