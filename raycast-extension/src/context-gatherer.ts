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

export interface ContextPreferences {
  clipboard: boolean;
  selection: boolean;
  application: boolean;
  date: boolean;
}

/**
 * Wraps a promise with a timeout. Returns undefined if the timeout is reached.
 */
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
      })(),
    );
  }

  if (preferences.selection) {
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
      })(),
    );
  }

  if (preferences.date) {
    context.date = new Date().toISOString();
  }

  await Promise.all(tasks);

  return context;
}
