import { getPreferenceValues } from "@raycast/api";

export type ExtensionPreferences = {
  promptsPath: string;
  pasteAfterCopy: boolean;
  enableSend: boolean;
  openaiModel?: string;
  openaiTemperature?: string;
  openaiMaxTokens?: string;
  contextDefaultClipboard: boolean;
  contextDefaultSelection: boolean;
  contextDefaultApp: boolean;
  contextDefaultDate: boolean;
  debugLog: boolean;
};

export function getExtensionPreferences(): ExtensionPreferences {
  return getPreferenceValues<ExtensionPreferences>();
}
