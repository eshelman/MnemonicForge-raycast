import { PromptParameter, PromptRecord } from "./prompt-types";

export type FormValues = Record<string, unknown>;

export type ClipboardSnapshot =
  | { kind: "empty" }
  | { kind: "text" | "url"; text: string }
  | { kind: "file"; file: string };

export type ClipboardFilter = "none" | "url" | "file";

export function fieldId(parameter: PromptParameter): string {
  return `param-${parameter.name}`;
}

function isLikelyUrl(text: string): boolean {
  return /^(https?:\/\/|www\.)\S+$/i.test(text);
}

export function classifyClipboard(content: {
  text?: string;
  file?: string;
}): ClipboardSnapshot {
  const file = content.file?.trim();
  if (file) {
    return { kind: "file", file };
  }
  const text = content.text?.trim();
  if (!text) {
    return { kind: "empty" };
  }
  return { kind: isLikelyUrl(text) ? "url" : "text", text };
}

export function defaultFilterFor(
  clipboard: ClipboardSnapshot,
): ClipboardFilter {
  return clipboard.kind === "url" || clipboard.kind === "file"
    ? clipboard.kind
    : "none";
}

function parameterHints(parameter: PromptParameter): string[] {
  return [parameter.name, parameter.label, parameter.regex]
    .filter((hint): hint is string => Boolean(hint))
    .map((hint) => hint.toLowerCase());
}

const FILTER_KEYWORDS: Record<Exclude<ClipboardFilter, "none">, string[]> = {
  url: ["url", "link"],
  file: ["file", "upload", "attachment", "document"],
};

export function matchesFilter(
  record: PromptRecord,
  filter: Exclude<ClipboardFilter, "none">,
): boolean {
  const frontMatter = record.frontMatter;
  if (frontMatter?.preferred_clipboard_types?.includes(filter)) {
    return true;
  }
  if (filter === "file" && frontMatter?.requires_file) {
    return true;
  }
  const keywords = FILTER_KEYWORDS[filter];
  return (frontMatter?.parameters ?? []).some((parameter) =>
    parameterHints(parameter).some((hint) =>
      keywords.some((keyword) => hint.includes(keyword)),
    ),
  );
}

function stringDefault(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function initialValue(parameter: PromptParameter, prefill?: string): unknown {
  switch (parameter.type) {
    case "boolean":
      return Boolean(parameter.default);
    case "date": {
      if (!parameter.default) {
        return undefined;
      }
      const date =
        parameter.default instanceof Date
          ? parameter.default
          : new Date(String(parameter.default));
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    case "array":
      return Array.isArray(parameter.default)
        ? parameter.default.join(`${parameter.delimiter ?? ";"} `)
        : stringDefault(parameter.default);
    case "string":
    case "text": {
      const value = stringDefault(parameter.default);
      return value.trim() ? value : (prefill ?? "");
    }
    default:
      return stringDefault(parameter.default);
  }
}

/** Clipboard text prefills the first parameter only, and only if it is free text without a default. */
export function initialFormValues(
  parameters: PromptParameter[],
  clipboard: ClipboardSnapshot,
): FormValues {
  const prefill =
    clipboard.kind === "text" || clipboard.kind === "url"
      ? clipboard.text
      : undefined;
  return Object.fromEntries(
    parameters.map((parameter, index) => [
      fieldId(parameter),
      initialValue(parameter, index === 0 ? prefill : undefined),
    ]),
  );
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function normalizeValue(parameter: PromptParameter, raw: unknown): unknown {
  switch (parameter.type) {
    case "boolean":
      return Boolean(raw);
    case "number":
      return isBlank(raw) ? undefined : Number(raw);
    case "date": {
      if (isBlank(raw)) {
        return undefined;
      }
      const date = raw instanceof Date ? raw : new Date(String(raw));
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    case "array":
      if (Array.isArray(raw)) {
        return raw;
      }
      return isBlank(raw)
        ? []
        : String(raw)
            .split(parameter.delimiter ?? ";")
            .map((entry) => entry.trim())
            .filter(Boolean);
    default:
      return raw ?? "";
  }
}

function matchesPattern(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    console.warn(`Ignoring invalid regex pattern: ${pattern}`);
    return true;
  }
}

export function collectParameters(
  parameters: PromptParameter[],
  formValues: FormValues,
): { values: Record<string, unknown>; errors: string[] } {
  const values: Record<string, unknown> = {};
  const missing: string[] = [];
  const errors: string[] = [];

  for (const parameter of parameters) {
    const label = parameter.label ?? parameter.name;
    const value = normalizeValue(parameter, formValues[fieldId(parameter)]);
    values[parameter.name] = value;

    if (isBlank(value)) {
      if (parameter.required) {
        missing.push(label);
      }
      continue;
    }
    if (parameter.type === "number" && Number.isNaN(value)) {
      errors.push(`${label} must be a number`);
    } else if (
      parameter.regex &&
      typeof value === "string" &&
      !matchesPattern(parameter.regex, value)
    ) {
      errors.push(`${label} does not match required pattern`);
    }
  }

  if (missing.length) {
    errors.unshift(`Missing required: ${missing.join(", ")}`);
  }
  return { values, errors };
}
