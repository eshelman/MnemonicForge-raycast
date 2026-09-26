import Handlebars from "handlebars";
import { PromptRecord } from "./prompt-types";

export interface RenderPromptOptions {
  parameters: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface RenderedPrompt {
  output: string;
  metadata: {
    title: string;
    description?: string;
    tags: string[];
    sourcePath: string;
  };
}

const handlebars = Handlebars.create();

// Handlebars appends its options object as the final helper argument, so
// optional positional arguments must be read from what precedes it.
function splitHelperArgs(args: unknown[]): {
  positional: unknown[];
  options: Handlebars.HelperOptions;
} {
  return {
    positional: args.slice(0, -1),
    options: args[args.length - 1] as Handlebars.HelperOptions,
  };
}

handlebars.registerHelper("uppercase", (value: unknown) =>
  String(value ?? "").toUpperCase(),
);

handlebars.registerHelper("lowercase", (value: unknown) =>
  String(value ?? "").toLowerCase(),
);

handlebars.registerHelper("join", (value: unknown, ...args: unknown[]) => {
  const [delimiter = ", "] = splitHelperArgs(args).positional;
  return Array.isArray(value)
    ? value.join(String(delimiter))
    : String(value ?? "");
});

handlebars.registerHelper("indent", (value: unknown, ...args: unknown[]) => {
  const [spaces = 2] = splitHelperArgs(args).positional;
  const padding = " ".repeat(Number(spaces) || 0);
  return String(value ?? "")
    .split("\n")
    .map((line) => `${padding}${line}`)
    .join("\n");
});

handlebars.registerHelper("nl2br", (value: unknown) =>
  String(value ?? "").replace(/\n/g, "<br />"),
);

// {{formatDate value "en-GB" dateStyle="long"}} — hash args are Intl.DateTimeFormat options.
handlebars.registerHelper(
  "formatDate",
  (value: unknown, ...args: unknown[]) => {
    const { positional, options } = splitHelperArgs(args);
    const [locale = "en-US"] = positional;
    const date = value instanceof Date ? value : new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    try {
      return new Intl.DateTimeFormat(String(locale), options.hash).format(date);
    } catch {
      return date.toISOString();
    }
  },
);

export function renderPrompt(
  record: PromptRecord,
  options: RenderPromptOptions,
): RenderedPrompt {
  if (!record.frontMatter) {
    throw new Error("Prompt is missing front matter and cannot be rendered.");
  }

  const template = handlebars.compile(record.content, { noEscape: true });
  // A prompt's own parameters win over built-in names like `context` or `tags`.
  const output = template({
    parameters: options.parameters,
    context: options.context ?? {},
    metadata: record.frontMatter,
    tags: record.tags,
    ...options.context,
    ...options.parameters,
  });

  return {
    output: output
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trimEnd(),
    metadata: {
      title: record.frontMatter.title,
      description: record.frontMatter.description,
      tags: record.tags,
      sourcePath: record.filePath,
    },
  };
}
