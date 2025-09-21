import { Action, ActionPanel, Clipboard, Detail, Form, Icon, Toast, showToast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { getExtensionPreferences } from "./preferences";
import { PromptParameter, PromptRecord } from "./prompt-types";
import { usePromptIndex } from "./use-prompt-index";
import { RenderedPrompt, renderPrompt } from "./prompt-renderer";
import { sendPromptToOpenAI, SendPromptResult } from "./openai-provider";
import { gatherContext } from "./context-gatherer";
import { summarizeContext } from "./context-summary";
import {
  getStoredOpenAIKey,
  removeStoredOpenAIKey,
  setStoredOpenAIKey,
} from "./openai-keychain";

interface RunPromptFormValues extends Form.Values {
  promptId?: string;
  [key: string]: unknown;
}

export default function RunPromptCommand() {
  const preferences = getExtensionPreferences();
  const {
    promptsPath,
    pasteAfterCopy,
    enableSend,
    contextDefaultClipboard,
    contextDefaultSelection,
    contextDefaultApp,
    contextDefaultDate,
  } = preferences;
  const { isLoading, error, records, hasIndex } = usePromptIndex(promptsPath);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [lastRendered, setLastRendered] = useState<(RenderedPrompt & { renderedAt: Date }) | null>(null);
  const [lastSendResult, setLastSendResult] = useState<
    | {
        prompt: RenderedPrompt & { renderedAt: Date };
        response: SendPromptResult;
      }
    | null
  >(null);
  const [isSending, setIsSending] = useState(false);
  const [lastContextSummary, setLastContextSummary] = useState<string | null>(null);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);

  useEffect(() => {
    if (error && promptsPath) {
      showToast({ style: Toast.Style.Failure, title: "Prompt index unavailable", message: error });
    }
  }, [error, promptsPath]);

  useEffect(() => {
    refreshOpenAIKeyPresence();
  }, []);

  async function refreshOpenAIKeyPresence() {
    const key = await getStoredOpenAIKey();
    setHasOpenAIKey(Boolean(key));
  }

  useEffect(() => {
    if (!records.length) {
      setSelectedPromptId(null);
      return;
    }

    if (!selectedPromptId) {
      setSelectedPromptId(records[0]?.id ?? null);
      return;
    }

    const stillPresent = records.some((record) => record.id === selectedPromptId);
    if (!stillPresent) {
      setSelectedPromptId(records[0]?.id ?? null);
    }
  }, [records, selectedPromptId]);

  const selectedRecord: PromptRecord | undefined = useMemo(
    () => records.find((record) => record.id === selectedPromptId),
    [records, selectedPromptId]
  );

  const parameterFields = selectedRecord?.frontMatter?.parameters ?? [];
  const formKey = selectedPromptId ?? "no-prompt";

  const prepareRender = async (values: RunPromptFormValues) => {
    const promptId = (values.promptId as string | undefined) ?? selectedPromptId ?? undefined;
    const record = records.find((item) => item.id === promptId);

    if (!record) {
      await showToast({ style: Toast.Style.Failure, title: "Select a prompt first" });
      return;
    }

    if (!record.frontMatter || record.validationIssues.length) {
      await showToast({ style: Toast.Style.Failure, title: "Prompt metadata incomplete" });
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
    options: { copy: boolean; paste: boolean }
  ) => {
    try {
      const prepared = await prepareRender(values);
      if (!prepared) {
        return;
      }

      const timestamped = { ...prepared.rendered, renderedAt: new Date() };
      setLastRendered(timestamped);
      setLastSendResult(null);
      refreshOpenAIKeyPresence();

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
        message: options.copy ? "Copied to clipboard" : "Rendered without copying",
      });

      console.debug("Prompt rendered", {
        promptId: prepared.record.id,
        preferences,
        context: prepared.promptContext,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to render prompt";
      await showToast({ style: Toast.Style.Failure, title: "Render failed", message });
    }
  };

  const handleSend = async (values: RunPromptFormValues) => {
    if (isSending) {
      await showToast({ style: Toast.Style.Animated, title: "Send already in progress" });
      return;
    }

    setIsSending(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Sending to OpenAI" });
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
      refreshOpenAIKeyPresence();

      toast.style = Toast.Style.Success;
      toast.title = "Sent to OpenAI";
      toast.message = response.tokensUsed ? `${response.tokensUsed} tokens` : undefined;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to send prompt";
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
            onSubmit={(values) => handleSubmit(values, { copy: true, paste: pasteAfterCopy })}
          />
          <Action.SubmitForm
            title="Render (Copy Only)"
            shortcut={{ modifiers: ["opt"], key: "enter" }}
            onSubmit={(values) => handleSubmit(values, { copy: true, paste: false })}
          />
          <Action.SubmitForm
            title="Render Without Copy"
            shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
            onSubmit={(values) => handleSubmit(values, { copy: false, paste: false })}
          />
          {enableSend ? (
            <Action.SubmitForm
              title={isSending ? "Sending…" : "Send with OpenAI"}
              shortcut={{ modifiers: ["cmd"], key: "enter" }}
              onSubmit={handleSend}
            />
          ) : null}
          {selectedRecord ? <Action.Open title="Open Prompt" target={selectedRecord.filePath} /> : null}
          {selectedRecord ? <Action.ShowInFinder title="Reveal in Finder" path={selectedRecord.filePath} /> : null}
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
          <Action.Push
            title="Manage OpenAI API Key"
            shortcut={{ modifiers: ["cmd"], key: "k" }}
            target={<ManageOpenAIKeyForm onUpdated={(present) => setHasOpenAIKey(present)} />}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="promptId"
        title="Prompt"
        placeholder={error ? "Prompts unavailable" : "Select a prompt"}
        value={selectedPromptId ?? undefined}
        onChange={setSelectedPromptId}
        storeValue
      >
        {records.map((record) => (
          <Form.Dropdown.Item
            key={record.id}
            value={record.id}
            title={record.frontMatter?.title ?? record.relativePath}
            icon={record.validationIssues.length ? Icon.Warning : Icon.Document}
            keywords={[record.relativePath]}
          />
        ))}
      </Form.Dropdown>

      <Form.Description title="Prompts Folder" text={promptsPath ?? "Not configured"} />
      <Form.Description title="Paste After Copy" text={pasteAfterCopy ? "Enabled" : "Disabled"} />
      <Form.Description title="OpenAI Send" text={enableSend ? "Enabled" : "Disabled"} />
      <Form.Description
        title="OpenAI API Key"
        text={hasOpenAIKey ? "Stored in Raycast local storage" : "Not configured"}
      />

      {selectedRecord ? (
        <Form.Description
          title="Selected Prompt"
          text={selectedRecord.frontMatter?.description ?? selectedRecord.excerpt.slice(0, 140)}
        />
      ) : (
        <Form.Description title="Selected Prompt" text="Choose a prompt to configure parameters." />
      )}

      {lastContextSummary ? (
        <Form.Description title="Context" text={lastContextSummary} />
      ) : null}

      {selectedRecord?.validationIssues.length ? (
        <Form.Description
          title="Metadata Issues"
          text={selectedRecord.validationIssues.map((issue) => issue.message).join("\n")}
        />
      ) : null}

      <Form.Separator />

      {parameterFields.length === 0 ? (
        <Form.Description title="Parameters" text="This prompt does not declare any parameters." />
      ) : (
        parameterFields.map((parameter) => renderParameterField(parameter))
      )}

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
  values: RunPromptFormValues
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
        <Form.Checkbox key={fieldId} id={fieldId} label={title} defaultValue={defaultValue} />
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
    case "string":
    default:
      return renderFallbackTextField(fieldId, title, parameter);
  }
}

function renderFallbackTextField(fieldId: string, title: string, parameter: PromptParameter) {
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

function normalizeParameterValue(parameter: PromptParameter, rawValue: unknown): unknown {
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
            <Detail.Metadata.Label title="Description" text={rendered.metadata.description} />
          ) : null}
          <Detail.Metadata.Label title="Source" text={rendered.metadata.sourcePath} />
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
          <Detail.Metadata.Label title="Sent" text={result.prompt.renderedAt.toLocaleString()} />
          {result.response.tokensUsed ? (
            <Detail.Metadata.Label title="Tokens" text={String(result.response.tokensUsed)} />
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

function ManageOpenAIKeyForm({ onUpdated }: { onUpdated: (present: boolean) => void }) {
  const [hasKey, setHasKey] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    getStoredOpenAIKey().then((key) => {
      setHasKey(Boolean(key));
    });
  }, []);

  async function handleSubmit(values: { apiKey?: string }) {
    const apiKey = values.apiKey?.trim();
    if (!apiKey) {
      await showToast({ style: Toast.Style.Failure, title: "Enter an API key" });
      return;
    }

    await setStoredOpenAIKey(apiKey);
    setHasKey(true);
    onUpdated(true);
    await showToast({ style: Toast.Style.Success, title: "API key saved" });
  }

  async function handleRemove() {
    setIsRemoving(true);
    try {
      await removeStoredOpenAIKey();
      setHasKey(false);
      onUpdated(false);
      await showToast({ style: Toast.Style.Success, title: "API key removed" });
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save API Key" onSubmit={handleSubmit} />
          {hasKey ? (
            <Action
              title={isRemoving ? "Removing…" : "Remove Stored Key"}
              onAction={handleRemove}
              style={Action.Style.Destructive}
            />
          ) : null}
        </ActionPanel>
      }
    >
      <Form.Description
        title="Status"
        text={hasKey ? "Key stored in Raycast local storage." : "No key stored."}
      />
      <Form.PasswordField id="apiKey" title="OpenAI API Key" placeholder="sk-..." />
    </Form>
  );
}
