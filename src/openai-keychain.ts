import { LocalStorage } from "@raycast/api";

const STORAGE_KEY = "mnemonicforge-openai-api-key";

export async function getStoredOpenAIKey(): Promise<string | null> {
  const key = await LocalStorage.getItem<string>(STORAGE_KEY);
  return key ?? null;
}

export async function setStoredOpenAIKey(apiKey: string): Promise<void> {
  // TODO: Encrypt the API key before persisting once Raycast exposes a secure keychain API.
  await LocalStorage.setItem(STORAGE_KEY, apiKey);
}

export async function removeStoredOpenAIKey(): Promise<void> {
  await LocalStorage.removeItem(STORAGE_KEY);
}
