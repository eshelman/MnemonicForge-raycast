import Handlebars from "handlebars";
import { PromptRecord } from "./prompt-types";

export interface RenderPromptOptions {
  parameters: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface RenderedPrompt {
  output: string;
  raw: string;
  metadata: {
    title: string;
    description?: string;
    tags: string[];
    sourcePath: string;
  };
}

const handlebars = Handlebars.create();
let helpersRegistered = false;

function ensureHelpersRegistered() {
  if (helpersRegistered) {
    return;
  }

  handlebars.registerHelper("uppercase", (value: unknown) => String(value ?? "").toUpperCase());
  handlebars.registerHelper("lowercase", (value: unknown) => String(value ?? "").toLowerCase());
  handlebars.registerHelper("join", (value: unknown, delimiter = ", ") => {
    if (!Array.isArray(value)) {
      return String(value ?? "");
    }
    return value.join(String(delimiter));
  });
  handlebars.registerHelper("indent", (value: unknown, spaces = 2) => {
    const padding = " ".repeat(Number(spaces) || 0);
    return String(value ?? "")
      .split("\n")
      .map((line) => `${padding}${line}`)
      .join("\n");
  });
  handlebars.registerHelper("nl2br", (value: unknown) => String(value ?? "").replace(/\n/g, "<br />"));
  handlebars.registerHelper("date", (value: unknown, locale = "en-US", options?: Intl.DateTimeFormatOptions) => {
    const date = value instanceof Date ? value : new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    try {
      return new Intl.DateTimeFormat(String(locale), options).format(date);
    } catch (error) {
      console.error("Date helper failed", error);
      return date.toISOString();
    }
  });

  helpersRegistered = true;
}

export function renderPrompt(record: PromptRecord, options: RenderPromptOptions): RenderedPrompt {
  if (!record.frontMatter) {
    throw new Error("Prompt is missing front matter and cannot be rendered.");
  }

  ensureHelpersRegistered();

  const template = handlebars.compile(record.content, {
    noEscape: true,
  });

  const context = {
    parameters: options.parameters,
    context: options.context ?? {},
    metadata: record.frontMatter,
    tags: record.tags,
  };

  const rawOutput = template(context);
  const output = postProcessOutput(rawOutput);

  return {
    output,
    raw: rawOutput,
    metadata: {
      title: record.frontMatter.title,
      description: record.frontMatter.description,
      tags: record.tags,
      sourcePath: record.filePath,
    },
  };
}

function postProcessOutput(text: string): string {
  const normalizedNewlines = text.replace(/\r\n/g, "\n");

  const strippedTrailingWhitespace = normalizedNewlines
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n");

  const normalizedFences = strippedTrailingWhitespace.replace(/```([^\n]*)[ \t]+\n/g, (match, lang) => {
    const cleaned = lang.trim();
    return cleaned ? `\`\`\`${cleaned}\n` : "```\n";
  });

  const trimmed = normalizedFences.replace(/\s+$/u, "").trimEnd();

  return trimmed;
}
