import { List } from "@raycast/api";
import { getExtensionPreferences } from "./preferences";

export default function BrowsePromptsCommand() {
  const { promptsPath } = getExtensionPreferences();
  const description = promptsPath
    ? `Scaffolding placeholder. Prompts folder: ${promptsPath}`
    : "Set the Prompts Folder preference to your prompt_templates directory.";

  return (
    <List searchBarPlaceholder="Search prompts">
      <List.EmptyView
        title="Prompt index not yet implemented"
        description={description}
      />
    </List>
  );
}
