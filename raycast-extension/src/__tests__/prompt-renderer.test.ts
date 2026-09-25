import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPrompt } from "../prompt-renderer";
import { PromptRecord } from "../prompt-types";

function recordWith(content: string, frontMatter = true): PromptRecord {
  return {
    id: "test.md",
    filePath: "/prompts/test.md",
    relativePath: "test.md",
    rootPath: "/prompts",
    tags: ["demo"],
    frontMatter: frontMatter
      ? { schema_version: 1, title: "Test Prompt" }
      : undefined,
    content,
    modifiedAt: new Date(0),
    validationIssues: [],
  };
}

const render = (
  content: string,
  parameters: Record<string, unknown> = {},
  context?: Record<string, unknown>,
) => renderPrompt(recordWith(content), { parameters, context }).output;

test("parameters and context are available at root and namespaced", () => {
  assert.equal(
    render(
      "{{topic}} / {{parameters.topic}} / {{app}} / {{context.app}}",
      { topic: "world" },
      { app: "Safari" },
    ),
    "world / world / Safari / Safari",
  );
});

test("parameters take precedence over context keys with the same name", () => {
  assert.equal(
    render("{{clipboard}}", { clipboard: "param" }, { clipboard: "ctx" }),
    "param",
  );
});

test("output is not HTML-escaped", () => {
  assert.equal(
    render("{{code}}", { code: 'a < b && c > "d"' }),
    'a < b && c > "d"',
  );
});

test("join uses ', ' by default instead of the Handlebars options object", () => {
  assert.equal(render("{{join items}}", { items: ["a", "b", "c"] }), "a, b, c");
});

test("join honors an explicit delimiter", () => {
  assert.equal(render('{{join items " | "}}', { items: ["a", "b"] }), "a | b");
});

test("indent pads every line by 2 spaces by default", () => {
  assert.equal(
    render("x\n{{indent body}}", { body: "one\ntwo" }),
    "x\n  one\n  two",
  );
});

test("date helper applies locale and Intl hash options", () => {
  assert.equal(
    render('{{date when "en-US" year="numeric"}}', {
      when: "2024-06-15T12:00:00Z",
    }),
    "2024",
  );
});

test("date helper returns empty string for invalid dates", () => {
  assert.equal(render("[{{date when}}]", { when: "not a date" }), "[]");
});

test("output strips trailing whitespace, CRLF, and trailing blank lines", () => {
  assert.equal(render("line one   \r\nline two\t\n\n\n"), "line one\nline two");
});

test("rendering a prompt without front matter throws", () => {
  assert.throws(
    () => renderPrompt(recordWith("hi", false), { parameters: {} }),
    /missing front matter/,
  );
});
