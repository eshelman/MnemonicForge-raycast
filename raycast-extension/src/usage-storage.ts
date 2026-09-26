import { LocalStorage } from "@raycast/api";
import { recordUse, UsageStats } from "./usage";

const USAGE_KEY = "prompt-usage";

export async function loadUsage(): Promise<UsageStats> {
  const raw = await LocalStorage.getItem<string>(USAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as UsageStats;
  } catch {
    return {};
  }
}

export async function recordPromptUse(id: string): Promise<void> {
  try {
    const stats = await loadUsage();
    await LocalStorage.setItem(
      USAGE_KEY,
      JSON.stringify(recordUse(stats, id, Date.now())),
    );
  } catch (error) {
    console.warn("Failed to record prompt usage", error);
  }
}
