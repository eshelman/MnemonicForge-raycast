import { test } from "node:test";
import assert from "node:assert/strict";
import { promptHasParameters } from "../prompt-utils";
import { PromptRecord } from "../prompt-types";

const baseRecord: Omit<PromptRecord, "frontMatter"> = {
  id: "example",
  filePath: "/tmp/example.md",
  relativePath: "example.md",
  tags: [],
  content: "",
  excerpt: "",
  modifiedAt: new Date(0),
  validationIssues: [],
};

const makeRecord = (
  frontMatter?: PromptRecord["frontMatter"],
): PromptRecord => ({
  ...baseRecord,
  frontMatter,
});

test("promptHasParameters returns false when parameters are missing", () => {
  assert.equal(promptHasParameters(makeRecord()), false);
});

test("promptHasParameters returns false when parameters array is empty", () => {
  const record = makeRecord({
    schema_version: 1,
    title: "Test",
    parameters: [],
  });

  assert.equal(promptHasParameters(record), false);
});

test("promptHasParameters returns true when parameters exist", () => {
  const record = makeRecord({
    schema_version: 1,
    title: "Test",
    parameters: [
      {
        name: "topic",
        type: "string",
      },
    ],
  });

  assert.equal(promptHasParameters(record), true);
});
