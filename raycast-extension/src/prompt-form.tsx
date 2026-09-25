import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  Icon,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useMemo, useState } from "react";
import { summarizeContext } from "./context-summary";
import { openInExternalEditor } from "./editor-utils";
import { sendPromptToOpenAI, SendPromptResult } from "./openai-provider";
import {
  ClipboardSnapshot,
  fieldId,
  FormValues,
  initialFormValues,
} from "./parameters";
import { RenderedPrompt } from "./prompt-renderer";
import { PromptParameter, PromptRecord } from "./prompt-types";
import { errorMessage, renderAndCopy, renderRecord } from "./render";

export function OpenPromptAction({ filePath }: { filePath: string }) {
  const editorCommand =
    getPreferenceValues<Preferences.Prompts>().externalEditorCommand?.trim();
  return editorCommand ? (
    <Action
      title="Open in External Editor"
      icon={Icon.Pencil}
      onAction={() => openInExternalEditor(filePath, editorCommand)}
    />
  ) : (
    <Action.Open title="Open Prompt" target={filePath} />
  );
}

export function PromptForm({
  record,
  clipboard,
}: {
  record: PromptRecord;
  clipboard: ClipboardSnapshot;
}) {
  const preferences = getPreferenceValues<Preferences.Prompts>();
  const { push } = useNavigation();
  const [isSending, setIsSending] = useState(false);
  const parameters = record.frontMatter?.parameters ?? [];
  const initialValues = useMemo(
    () => initialFormValues(parameters, clipboard),
    [record, clipboard],
  );

  const copy = async (values: FormValues, paste: boolean) => {
    try {
      const message = await renderAndCopy(
        record,
        values,
        clipboard,
        paste,
        preferences,
      );
      await showHUD(message);
      await popToRoot({ clearSearchBar: true });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message: errorMessage(error, "Failed to render prompt"),
      });
    }
  };

  const preview = async (values: FormValues) => {
    try {
      const { rendered } = await renderRecord(record, values, preferences);
      push(<PromptPreview rendered={rendered} />);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message: errorMessage(error, "Failed to render prompt"),
      });
    }
  };

  const send = async (values: FormValues) => {
    if (isSending) {
      return;
    }
    setIsSending(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Sending to OpenAI",
    });
    try {
      const { rendered, context } = await renderRecord(
        record,
        values,
        preferences,
      );
      const response = await sendPromptToOpenAI(
        rendered.output,
        record.frontMatter!,
      );
      toast.style = Toast.Style.Success;
      toast.title = "Received response";
      toast.message = response.tokensUsed
        ? `${response.tokensUsed} tokens`
        : undefined;
      push(
        <SendResultPreview
          rendered={rendered}
          response={response}
          contextSummary={summarizeContext(context)}
        />,
      );
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Send failed";
      toast.message = errorMessage(error, "Failed to send prompt");
    } finally {
      setIsSending(false);
    }
  };

  const issues = record.validationIssues.map((issue) => issue.message);

  return (
    <Form
      isLoading={isSending}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Render & Copy"
            icon={Icon.Clipboard}
            onSubmit={(values) => copy(values, preferences.pasteAfterCopy)}
          />
          <Action.SubmitForm
            title="Render (Copy Only)"
            icon={Icon.CopyClipboard}
            shortcut={{ modifiers: ["opt"], key: "enter" }}
            onSubmit={(values) => copy(values, false)}
          />
          <Action.SubmitForm
            title="Preview Render"
            icon={Icon.Eye}
            shortcut={{ modifiers: ["cmd"], key: "y" }}
            onSubmit={preview}
          />
          {preferences.enableSend ? (
            <Action.SubmitForm
              title={isSending ? "Sending…" : "Send with Openai"}
              icon={Icon.Upload}
              shortcut={{ modifiers: ["cmd", "opt"], key: "enter" }}
              onSubmit={send}
            />
          ) : null}
          <OpenPromptAction filePath={record.filePath} />
          <Action.ShowInFinder path={record.filePath} />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Prompt"
        text={record.frontMatter?.title ?? record.relativePath}
      />
      {record.frontMatter?.description ? (
        <Form.Description
          title="Summary"
          text={record.frontMatter.description}
        />
      ) : null}
      {issues.length ? (
        <Form.Description title="Metadata Issues" text={issues.join("\n")} />
      ) : null}
      <Form.Separator />
      {parameters.length ? (
        parameters.map((parameter) =>
          renderField(parameter, initialValues[fieldId(parameter)]),
        )
      ) : (
        <Form.Description
          title="Parameters"
          text="This prompt does not declare any parameters."
        />
      )}
      <Form.Separator />
      <Form.Description
        title="Prompt Content"
        text={
          record.content.length > 500
            ? `${record.content.slice(0, 500)}…`
            : record.content
        }
      />
    </Form>
  );
}

function renderField(parameter: PromptParameter, initialValue: unknown) {
  const id = fieldId(parameter);
  const label = parameter.label ?? parameter.name;
  const title = parameter.required ? `${label} *` : label;
  const placeholder = parameter.required ? "Required" : "Optional";

  switch (parameter.type) {
    case "boolean":
      return (
        <Form.Checkbox
          key={id}
          id={id}
          label={title}
          defaultValue={initialValue as boolean}
        />
      );
    case "date":
      return (
        <Form.DatePicker
          key={id}
          id={id}
          title={title}
          type={Form.DatePicker.Type.Date}
          defaultValue={initialValue as Date | undefined}
        />
      );
    case "enum":
      if (parameter.options?.length) {
        return (
          <Form.Dropdown
            key={id}
            id={id}
            title={title}
            defaultValue={(initialValue as string) || undefined}
          >
            {parameter.options.map((option) => (
              <Form.Dropdown.Item key={option} value={option} title={option} />
            ))}
          </Form.Dropdown>
        );
      }
      break;
    case "array":
      return (
        <Form.TextArea
          key={id}
          id={id}
          title={title}
          placeholder={`Enter values separated by '${parameter.delimiter ?? ";"}'`}
          defaultValue={initialValue as string}
        />
      );
    case "text":
      return (
        <Form.TextArea
          key={id}
          id={id}
          title={title}
          placeholder={placeholder}
          defaultValue={initialValue as string}
        />
      );
    case "string":
      if (parameter.multiline) {
        return (
          <Form.TextArea
            key={id}
            id={id}
            title={title}
            placeholder={placeholder}
            defaultValue={initialValue as string}
          />
        );
      }
      break;
  }

  return (
    <Form.TextField
      key={id}
      id={id}
      title={title}
      placeholder={placeholder}
      defaultValue={String(initialValue ?? "")}
    />
  );
}

function codeBlock(text: string): string {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${text}\n${fence}`;
}

function PromptPreview({ rendered }: { rendered: RenderedPrompt }) {
  const { metadata } = rendered;
  return (
    <Detail
      markdown={`# ${metadata.title}\n\n${codeBlock(rendered.output)}`}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard content={rendered.output} />
          <Action.Paste content={rendered.output} />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          {metadata.description ? (
            <Detail.Metadata.Label
              title="Description"
              text={metadata.description}
            />
          ) : null}
          <Detail.Metadata.Label title="Source" text={metadata.sourcePath} />
          {metadata.tags.length ? (
            <Detail.Metadata.TagList title="Tags">
              {metadata.tags.map((tag) => (
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
  rendered,
  response,
  contextSummary,
}: {
  rendered: RenderedPrompt;
  response: SendPromptResult;
  contextSummary: string;
}) {
  const markdown = [
    `# ${rendered.metadata.title}`,
    "## Response",
    response.output || "_No content returned._",
    "## Prompt",
    codeBlock(rendered.output),
  ].join("\n\n");

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Response"
            content={response.output}
          />
          <Action.CopyToClipboard
            title="Copy Prompt"
            content={rendered.output}
          />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          {response.tokensUsed ? (
            <Detail.Metadata.Label
              title="Tokens"
              text={String(response.tokensUsed)}
            />
          ) : null}
          <Detail.Metadata.Label title="Context" text={contextSummary} />
        </Detail.Metadata>
      }
    />
  );
}
