import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { isPromptFile, parsePrompt } from "../prompt-parser";

const root = "/prompts";
const parse = (raw: string, relative = "note.md") =>
  parsePrompt(raw, path.join(root, relative), root);

test("valid front matter yields no issues and separates body from metadata", () => {
  const record = parse(
    "---\nschema_version: 1\ntitle: Hello\n---\nBody {{x}}\n",
  );
  assert.deepEqual(record.validationIssues, []);
  assert.equal(record.frontMatter?.title, "Hello");
  assert.equal(record.content.trim(), "Body {{x}}");
});

test("id and relativePath are relative to the root", () => {
  const record = parse(
    "---\nschema_version: 1\ntitle: T\n---\n",
    path.join("work", "a.md"),
  );
  assert.equal(record.id, path.join("work", "a.md"));
  assert.equal(record.relativePath, path.join("work", "a.md"));
});

test("tags combine slugified folders with declared tags, lowercased and deduplicated", () => {
  const record = parse(
    "---\nschema_version: 1\ntitle: T\ntags: [Email, ' Drafts ']\n---\n",
    path.join("Work Stuff", "email", "a.md"),
  );
  assert.deepEqual(record.tags, ["work-stuff", "email", "drafts"]);
});

test("files without front matter are flagged but still indexed", () => {
  const record = parse("Just text");
  assert.equal(record.frontMatter, undefined);
  assert.deepEqual(record.validationIssues, [
    { message: "Missing front matter metadata" },
  ]);
});

test("schema violations are reported with their location and front matter is withheld", () => {
  const record = parse(
    "---\nschema_version: 1\ntitle: T\nparameters:\n  - name: 1bad\n    type: string\n---\n",
  );
  assert.equal(record.frontMatter, undefined);
  assert.ok(
    record.validationIssues.some(
      (issue) => issue.path === "/parameters/0/name",
    ),
  );
});

test("isPromptFile matches supported extensions case-insensitively", () => {
  assert.equal(isPromptFile("a.MD"), true);
  assert.equal(isPromptFile("dir/b.yaml"), true);
  assert.equal(isPromptFile("c.json"), false);
  assert.equal(isPromptFile("Makefile"), false);
});
