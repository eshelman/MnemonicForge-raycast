import { PromptContext } from "./context-gatherer";

export function summarizeContext(context: PromptContext): string {
  const summaries: string[] = [];

  if (context.clipboard) {
    summaries.push(`Clipboard (${context.clipboard.length} chars)`);
  }

  if (context.selection) {
    summaries.push(`Selection (${context.selection.length} chars)`);
  }

  if (context.application) {
    summaries.push(`App: ${context.application.name}`);
  }

  if (context.date) {
    summaries.push(`Date: ${new Date(context.date).toLocaleString()}`);
  }

  if (summaries.length === 0) {
    return "No context captured";
  }

  return summaries.join(" • ");
}
