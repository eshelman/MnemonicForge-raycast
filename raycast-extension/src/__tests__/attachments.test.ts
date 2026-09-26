import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { resolveAttachments } from "../attachments";
import { PromptRecord } from "../prompt-types";

let dir: string;
let root: string;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "mf-attachments-"));
  root = path.join(dir, "prompts");
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(path.join(root, "assets", "a.txt"), "a");
  await writeFile(path.join(root, "..notes.md"), "n");
  await writeFile(path.join(dir, "outside.txt"), "o");
});

after(() => rm(dir, { recursive: true, force: true }));

function recordWith(files: string[]): PromptRecord {
  return {
    id: "p.md",
    filePath: path.join(root, "p.md"),
    relativePath: "p.md",
    rootPath: root,
    tags: [],
    frontMatter: { schema_version: 1, title: "P", files_to_paste: files },
    content: "",
    validationIssues: [],
  };
}

test("relative paths resolve against the prompts root and are deduplicated", async () => {
  const result = await resolveAttachments(
    recordWith(["assets/a.txt", " ./assets/a.txt ", ""]),
  );
  assert.deepEqual(result, [path.join(root, "assets", "a.txt")]);
});

test("paths escaping the prompts root are rejected", async () => {
  await assert.rejects(
    resolveAttachments(recordWith(["../outside.txt"])),
    /must stay within/,
  );
  await assert.rejects(
    resolveAttachments(recordWith([path.join(dir, "outside.txt")])),
    /must stay within/,
  );
});

test("a file whose name merely starts with '..' is inside the root", async () => {
  assert.deepEqual(await resolveAttachments(recordWith(["..notes.md"])), [
    path.join(root, "..notes.md"),
  ]);
});

test("missing files and directories are rejected", async () => {
  await assert.rejects(
    resolveAttachments(recordWith(["nope.txt"])),
    /not found/,
  );
  await assert.rejects(
    resolveAttachments(recordWith(["assets"])),
    /must be a file/,
  );
});

test("clipboard files may live anywhere and accept file:// URLs", async () => {
  const outside = path.join(dir, "outside.txt");
  assert.deepEqual(
    await resolveAttachments(recordWith([]), pathToFileURL(outside).href),
    [outside],
  );
});
