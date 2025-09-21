import { getFrontmostApplication, getSelectedText, Clipboard } from "@raycast/api";

export interface PromptContext {
  clipboard?: string;
  selection?: string;
  application?: {
    name: string;
    bundleId?: string;
  };
  date?: string;
  [key: string]: unknown;
}

export interface ContextPreferences {
  clipboard: boolean;
  selection: boolean;
  application: boolean;
  date: boolean;
}

export async function gatherContext(preferences: ContextPreferences): Promise<PromptContext> {
  const context: PromptContext = {};

  const tasks: Promise<void>[] = [];

  if (preferences.clipboard) {
    tasks.push(
      (async () => {
        try {
          const clipboardText = await Clipboard.readText();
          if (clipboardText) {
            context.clipboard = clipboardText;
          }
        } catch (error) {
          console.warn("Failed to read clipboard", error);
        }
      })()
    );
  }

  if (preferences.selection) {
    tasks.push(
      (async () => {
        try {
          const selection = await getSelectedText();
          if (selection) {
            context.selection = selection;
          }
        } catch (error) {
          if ((error as Error)?.name !== "NoSelectionError") {
            console.warn("Failed to read selection", error);
          }
        }
      })()
    );
  }

  if (preferences.application) {
    tasks.push(
      (async () => {
        try {
          const app = await getFrontmostApplication();
          if (app) {
            context.application = {
              name: app.name,
              bundleId: app.bundleId,
            };
          }
        } catch (error) {
          console.warn("Failed to read frontmost application", error);
        }
      })()
    );
  }

  if (preferences.date) {
    context.date = new Date().toISOString();
  }

  await Promise.all(tasks);

  return context;
}
