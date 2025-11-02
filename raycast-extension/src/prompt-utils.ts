import { PromptRecord } from "./prompt-types";

export function promptHasParameters(record: PromptRecord): boolean {
  const parameters = record.frontMatter?.parameters;
  if (!parameters) {
    return false;
  }
  return parameters.length > 0;
}
