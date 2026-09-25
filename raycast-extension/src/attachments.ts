import { stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PromptRecord } from "./prompt-types";

async function assertFile(filePath: string, label: string): Promise<void> {
  const stats = await stat(filePath).catch(() => null);
  if (!stats) {
    throw new Error(`Attachment file not found: ${label}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Attachment must be a file: ${label}`);
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Resolves the prompt's `files_to_paste` (confined to the prompts folder) plus an optional clipboard file. */
export async function resolveAttachments(
  record: PromptRecord,
  clipboardFile?: string,
): Promise<string[]> {
  const root = path.resolve(record.rootPath);
  const attachments = new Set<string>();

  for (const entry of record.frontMatter?.files_to_paste ?? []) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const candidate = path.resolve(root, trimmed);
    if (!isInside(root, candidate)) {
      throw new Error(
        `Attachment path '${trimmed}' must stay within the prompts directory`,
      );
    }
    await assertFile(candidate, trimmed);
    attachments.add(candidate);
  }

  if (clipboardFile) {
    const candidate = path.resolve(
      clipboardFile.startsWith("file://")
        ? fileURLToPath(clipboardFile)
        : clipboardFile,
    );
    await assertFile(candidate, clipboardFile);
    attachments.add(candidate);
  }

  return [...attachments];
}
