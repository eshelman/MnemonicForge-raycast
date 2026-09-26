import { Clipboard } from "@raycast/api";
import { resolveAttachments } from "./attachments";
import { gatherContext, PromptContext } from "./context-gatherer";
import { ClipboardSnapshot, collectParameters, FormValues } from "./parameters";
import { RenderedPrompt, renderPrompt } from "./prompt-renderer";
import { PromptRecord } from "./prompt-types";
import { recordPromptUse } from "./usage-storage";

type RenderPreferences = Preferences.Prompts;

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function renderRecord(
  record: PromptRecord,
  formValues: FormValues,
  preferences: RenderPreferences,
): Promise<{ rendered: RenderedPrompt; context: PromptContext }> {
  if (!record.frontMatter || record.validationIssues.length) {
    throw new Error("Fix this prompt's front matter before rendering it.");
  }
  const { values, errors } = collectParameters(
    record.frontMatter.parameters ?? [],
    formValues,
  );
  if (errors.length) {
    throw new Error(errors.join("; "));
  }
  const context = await gatherContext(preferences);
  const rendered = renderPrompt(record, { parameters: values, context });
  await recordPromptUse(record.id);
  return { rendered, context };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptPaste(
  content: Parameters<typeof Clipboard.paste>[0],
): Promise<void> {
  try {
    await Clipboard.paste(content);
  } catch (error) {
    console.warn("Paste failed", error);
  }
}

/** Returns the HUD message describing what happened. */
async function copyToClipboard(
  text: string,
  attachments: string[],
  paste: boolean,
): Promise<string> {
  await Clipboard.copy(text);
  if (!paste) {
    // The clipboard holds one item, so attachments only reach the target app when pasting.
    return attachments.length
      ? "Copied text only — attachments need Paste After Copy"
      : "Copied to clipboard";
  }

  // The delays give the frontmost app time to consume each paste before the clipboard changes.
  await sleep(50);
  await attemptPaste(text);
  if (!attachments.length) {
    return "Copied to clipboard";
  }

  await sleep(100);
  try {
    for (const file of attachments) {
      await Clipboard.copy({ file });
      await sleep(75);
      await attemptPaste({ file });
      await sleep(150);
    }
  } finally {
    await sleep(100);
    await Clipboard.copy(text);
  }
  return attachments.length === 1
    ? "Pasted with 1 attachment"
    : `Pasted with ${attachments.length} attachments`;
}

function truncateForLog(context: PromptContext, maxLength = 200) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === "string" && value.length > maxLength
        ? `${value.slice(0, maxLength)}…`
        : value,
    ]),
  );
}

/** Renders, then copies (and optionally pastes) the output plus attachments. Returns a HUD message. */
export async function renderAndCopy(
  record: PromptRecord,
  formValues: FormValues,
  clipboard: ClipboardSnapshot,
  paste: boolean,
  preferences: RenderPreferences,
): Promise<string> {
  const { rendered, context } = await renderRecord(
    record,
    formValues,
    preferences,
  );
  const attachments = await resolveAttachments(
    record,
    clipboard.kind === "file" ? clipboard.file : undefined,
  );
  const message = await copyToClipboard(rendered.output, attachments, paste);

  if (preferences.debugLog) {
    console.debug("Prompt rendered", {
      promptId: record.id,
      context: truncateForLog(context),
      attachments,
    });
  }
  return message;
}
