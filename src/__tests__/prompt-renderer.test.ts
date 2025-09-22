import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPrompt } from "../prompt-renderer";
import { PromptRecord } from "../prompt-types";

test("renderPrompt exposes parameters at the root scope", () => {
  const record: PromptRecord = {
    id: "test-prompt",
    filePath: "/tmp/test-prompt.md",
    relativePath: "test-prompt.md",
    tags: [],
    frontMatter: {
      schema_version: 1,
      title: "Test Prompt",
      description: "A test prompt",
    },
    content: "Hello {{topic}}!",
    excerpt: "Hello...",
    modifiedAt: new Date(0),
    validationIssues: [],
  };

  const result = renderPrompt(record, {
    parameters: {
      topic: "world",
    },
  });

  assert.equal(result.output, "Hello world!");
});
