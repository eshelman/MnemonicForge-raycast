import {
  getFrontmostApplication,
  getSelectedText,
  Clipboard,
} from "@raycast/api";

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

type ContextPreferences = Pick<
  Preferences.Prompts,
  | "contextDefaultClipboard"
  | "contextDefaultSelection"
  | "contextDefaultApp"
  | "contextDefaultDate"
>;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => resolve(undefined), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function gatherContext(
  preferences: ContextPreferences,
): Promise<PromptContext> {
  const context: PromptContext = {};

  const tasks: Promise<void>[] = [];

  if (preferences.contextDefaultClipboard) {
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
      })(),
    );
  }

  if (preferences.contextDefaultSelection) {
    tasks.push(
      (async () => {
        try {
          // getSelectedText uses macOS accessibility APIs which can be slow
          // (2+ seconds) in certain apps. Use a timeout to prevent blocking.
          const selection = await withTimeout(getSelectedText(), 500);
          if (selection) {
            context.selection = selection;
          }
        } catch {
          // Selection capture fails when no text is selected - this is expected
        }
      })(),
    );
  }

  if (preferences.contextDefaultApp) {
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
      })(),
    );
  }

  if (preferences.contextDefaultDate) {
    context.date = new Date().toISOString();
  }

  await Promise.all(tasks);

  return context;
}
