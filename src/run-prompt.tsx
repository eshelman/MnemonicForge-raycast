import { Action, ActionPanel, Form } from "@raycast/api";
import { getExtensionPreferences } from "./preferences";

export default function RunPromptCommand() {
  const { promptsPath, pasteAfterCopy, enableSend } = getExtensionPreferences();

  return (
    <Form>
      <Form.Description
        title="Prompt runner not yet implemented"
        text="This scaffolding command will evolve to render Handlebars templates with runtime parameters."
      />
      <Form.Description title="Prompts Folder" text={promptsPath || "Not configured"} />
      <Form.Separator />
      <Form.Description title="Paste After Copy" text={pasteAfterCopy ? "Enabled" : "Disabled"} />
      <Form.Description title="OpenAI Send" text={enableSend ? "Enabled" : "Disabled"} />
      <ActionPanel>
        <Action.SubmitForm title="Acknowledge" onSubmit={() => undefined} />
      </ActionPanel>
    </Form>
  );
}
