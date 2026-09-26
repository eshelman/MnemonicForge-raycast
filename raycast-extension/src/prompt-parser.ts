import path from "path";
import matter from "gray-matter";
import Ajv from "ajv";
import schema from "../prompt.schema.json";
import {
  PromptFrontMatter,
  PromptRecord,
  PromptValidationIssue,
} from "./prompt-types";

const PROMPT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml",
]);

const validateFrontMatter = new Ajv({
  allErrors: true,
  strict: false,
}).compile<PromptFrontMatter>(schema);

export function isPromptFile(filePath: string): boolean {
  return PROMPT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function toTag(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function deriveTags(
  relativePath: string,
  frontMatter?: PromptFrontMatter,
): string[] {
  const folderTags = path
    .dirname(relativePath)
    .split(path.sep)
    .filter((segment) => segment && segment !== ".")
    .map(toTag);
  const declaredTags = (frontMatter?.tags ?? []).map((tag) =>
    tag.trim().toLowerCase(),
  );
  return [...new Set([...folderTags, ...declaredTags].filter(Boolean))];
}

function validate(data: Record<string, unknown>): {
  frontMatter?: PromptFrontMatter;
  validationIssues: PromptValidationIssue[];
} {
  if (Object.keys(data).length === 0) {
    return { validationIssues: [{ message: "Missing front matter metadata" }] };
  }
  if (validateFrontMatter(data)) {
    return { frontMatter: data, validationIssues: [] };
  }
  return {
    validationIssues: (validateFrontMatter.errors ?? []).map((error) => ({
      message: error.message ?? "Unknown schema validation error",
      path: error.instancePath || undefined,
    })),
  };
}

export function parsePrompt(
  raw: string,
  filePath: string,
  rootPath: string,
): PromptRecord {
  const { data, content } = matter(raw);
  const relativePath = path.relative(rootPath, filePath);
  const { frontMatter, validationIssues } = validate(data);

  return {
    id: relativePath,
    filePath,
    relativePath,
    rootPath,
    tags: deriveTags(relativePath, frontMatter),
    frontMatter,
    content,
    validationIssues,
  };
}
