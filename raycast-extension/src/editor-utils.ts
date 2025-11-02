import { showToast, Toast } from "@raycast/api";
import { spawn } from "child_process";

export async function openInExternalEditor(
  filePath: string,
  commandOrPath?: string | null,
): Promise<void> {
  const command = commandOrPath?.trim();
  if (!command) {
    throw new Error("No external editor command configured");
  }

  try {
    const [executable, ...rest] = splitCommand(command);
    const child = spawn(executable, [...rest, filePath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (error) {
    console.error("Failed to launch external editor", error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to open editor",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === " " && !inQuotes) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}
