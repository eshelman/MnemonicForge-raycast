import { showToast, Toast } from "@raycast/api";
import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import path from "path";

const KNOWN_EDITORS = new Set([
  "code",
  "code-insiders",
  "cursor",
  "subl",
  "sublime",
  "atom",
  "vim",
  "nvim",
  "nano",
  "emacs",
  "mate",
  "bbedit",
  "edit",
  "notepad",
  "gedit",
  "kate",
  "open",
  "xdg-open",
]);

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of command) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === " " && !inQuotes) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

async function assertAllowedEditor(executable: string): Promise<void> {
  if (KNOWN_EDITORS.has(executable.toLowerCase())) {
    return;
  }
  if (!path.isAbsolute(executable) || path.resolve(executable) !== executable) {
    throw new Error(
      `Unknown editor '${executable}'. Use a known editor (code, subl, vim, …) or a normalized absolute path.`,
    );
  }
  await access(executable, constants.X_OK).catch(() => {
    throw new Error(`Editor not found or not executable: ${executable}`);
  });
}

function launch(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, stdio: "ignore" });
    child.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "ENOENT"
          ? new Error(`Editor '${executable}' was not found on PATH`)
          : error,
      ),
    );
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function openInExternalEditor(
  filePath: string,
  command: string,
): Promise<void> {
  try {
    const [executable, ...args] = splitCommand(command.trim());
    await assertAllowedEditor(executable);
    await launch(executable, [...args, filePath]);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to open editor",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
