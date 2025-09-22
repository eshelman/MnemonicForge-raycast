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
  showToast,
} from "@raycast/api";
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

interface RunPromptFormValues extends Form.Values {
  [key: string]: unknown;
}

export default function PromptsCommand() {
  const preferences = getExtensionPreferences();
  const [searchText, setSearchText] = useState("");

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

    if (!searchText.trim()) {
      return records.map((record, index) => ({ record, score: index }));
    }

    return search(searchText);
  }, [hasIndex, error, records, searchText, search]);

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

    const { collected, missing } = collectParameters(record, formValues);
    if (missing.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Quick render needs inputs",
        message: missing.map((parameter) => parameter.name).join(", "),
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

      await Clipboard.copy(rendered.output);
      if (pasteAfterCopy) {
        try {
          await Clipboard.paste(rendered.output);
        } catch (clipboardError) {
          console.warn("Paste failed", clipboardError);
        }
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Prompt ready",
        message: "Copied to clipboard",
      });

      if (preferences.debugLog) {
        console.debug("Prompt quick render", {
          promptId: record.id,
          contextKeys: Object.keys(promptContext),
        });
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to render prompt";
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message,
      });
    }
  };

  return (
    <List
      searchBarPlaceholder="Search prompts"
      onSearchTextChange={setSearchText}
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
}: {
  preferences: ExtensionPreferences;
  initialPromptId: string;
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

    const { collected, missing } = collectParameters(record, values);

    if (missing.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing required inputs",
        message: missing.map((parameter) => parameter.name).join(", "),
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

      if (options.copy) {
        await Clipboard.copy(timestamped.output);
        if (options.paste) {
          try {
            await Clipboard.paste(timestamped.output);
          } catch (clipboardError) {
            console.warn("Paste failed", clipboardError);
          }
        }
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Prompt ready",
        message: options.copy
          ? "Copied to clipboard"
          : "Rendered without copying",
      });

      if (preferences.debugLog) {
        console.debug("Prompt rendered", {
          promptId: prepared.record.id,
          contextKeys: Object.keys(prepared.promptContext),
        });
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to render prompt";
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message,
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
      const message =
        caught instanceof Error ? caught.message : "Failed to send prompt";
      toast.style = Toast.Style.Failure;
      toast.title = "Send failed";
      toast.message = message;
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
        parameterFields.map((parameter) => renderParameterField(parameter))
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

function collectParameters(
  record: PromptRecord,
  values: RunPromptFormValues,
): { collected: Record<string, unknown>; missing: PromptParameter[] } {
  const parameters = record.frontMatter?.parameters ?? [];
  const collected: Record<string, unknown> = {};
  const missing: PromptParameter[] = [];

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
      }
    }
  }

  return { collected, missing };
}

function renderParameterField(parameter: PromptParameter) {
  const fieldId = fieldNameForParameter(parameter);
  const label = parameter.label ?? parameter.name;
  const title = parameter.required ? `${label} *` : label;

  switch (parameter.type) {
    case "text": {
      const defaultValue = stringifyDefault(parameter.default);
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
      return renderFallbackTextField(fieldId, title, parameter);
  }
}

function renderFallbackTextField(
  fieldId: string,
  title: string,
  parameter: PromptParameter,
) {
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

function fieldNameForParameter(parameter: PromptParameter): string {
  return `param-${parameter.name}`;
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
