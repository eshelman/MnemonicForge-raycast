import { showToast, Toast } from "@raycast/api";
import { spawn, execSync } from "child_process";
import { access, constants } from "fs/promises";
import { resolve } from "path";

/**
 * Check if a command exists in the system PATH.
 * Returns the resolved path if found, null otherwise.
 */
function findCommandInPath(command: string): string | null {
  try {
    const result = execSync(`which ${command}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

// Allowlist of known safe editor commands
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

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isKnownEditor(executable: string): boolean {
  // Only treat as known editor if it's a bare command name, not an absolute path
  if (executable.startsWith("/")) {
    return false;
  }
  return KNOWN_EDITORS.has(executable.toLowerCase());
}

export async function openInExternalEditor(
  filePath: string,
  commandOrPath?: string | null,
): Promise<void> {
  const command = commandOrPath?.trim();
  if (!command) {
    throw new Error("No external editor command configured");
  }

  const [executable, ...rest] = splitCommand(command);

  // Validate the executable is either a known editor or an absolute path that exists
  if (isKnownEditor(executable)) {
    // For known editors, verify they exist in PATH before attempting to spawn
    const resolvedPath = findCommandInPath(executable);
    if (!resolvedPath) {
      throw new Error(
        `Editor '${executable}' not found. Please install it or add it to your PATH, ` +
          `or configure a different editor in the extension preferences.`,
      );
    }
  } else {
    if (!executable.startsWith("/")) {
      throw new Error(
        `Unknown editor command '${executable}'. Use a known editor (code, subl, vim, etc.) or an absolute path.`,
      );
    }

    const resolvedPath = resolve(executable);
    if (resolvedPath !== executable) {
      throw new Error(
        "Editor path must be an absolute path without relative components",
      );
    }

    if (!(await isExecutable(executable))) {
      throw new Error(`Editor not found or not executable: ${executable}`);
    }
  }

  try {
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
