import { test } from "node:test";
import assert from "node:assert/strict";
import { PromptRecord } from "../prompt-types";
import {
  frecency,
  rankForBrowse,
  rankSearchResults,
  recordUse,
  UsageStats,
} from "../usage";

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000;

function record(id: string, title?: string): PromptRecord {
  return {
    id,
    filePath: `/p/${id}`,
    relativePath: id,
    rootPath: "/p",
    tags: [],
    frontMatter: title ? { schema_version: 1, title } : undefined,
    content: "",
    validationIssues: [],
  };
}

const ids = (records: PromptRecord[]) => records.map((r) => r.id);

test("recordUse increments count and stamps time without mutating input", () => {
  const before: UsageStats = { a: { count: 2, lastUsed: 0 } };
  const after = recordUse(recordUse(before, "a", NOW), "b", NOW);
  assert.deepEqual(after, {
    a: { count: 3, lastUsed: NOW },
    b: { count: 1, lastUsed: NOW },
  });
  assert.deepEqual(before, { a: { count: 2, lastUsed: 0 } });
});

test("frecency halves every 14 days and is 0 for unused prompts", () => {
  assert.equal(frecency(undefined, NOW), 0);
  assert.equal(frecency({ count: 4, lastUsed: NOW }, NOW), 4);
  assert.equal(frecency({ count: 4, lastUsed: NOW - 14 * DAY }, NOW), 2);
});

test("browse puts used prompts first, then the rest alphabetically by title", () => {
  const records = [
    record("z.md", "Zebra"),
    record("m.md", "Mango"),
    record("a.md", "Apple"),
    record("untitled.md"),
  ];
  const stats: UsageStats = { "z.md": { count: 1, lastUsed: NOW } };
  assert.deepEqual(ids(rankForBrowse(records, stats, NOW)), [
    "z.md",
    "a.md",
    "m.md",
    "untitled.md",
  ]);
});

test("a heavy recent user outranks an occasional user even if used less recently", () => {
  const stats: UsageStats = {
    heavy: { count: 20, lastUsed: NOW - 3 * DAY },
    once: { count: 1, lastUsed: NOW },
  };
  assert.deepEqual(
    ids(rankForBrowse([record("once", "A"), record("heavy", "B")], stats, NOW)),
    ["heavy", "once"],
  );
});

test("search: usage lifts a slightly weaker match but not a much weaker one", () => {
  const stats: UsageStats = { used: { count: 10, lastUsed: NOW } };
  const close = [
    { record: record("best", "Best"), score: 0.1 },
    { record: record("used", "Used"), score: 0.15 },
  ];
  assert.deepEqual(ids(rankSearchResults(close, stats, NOW)), ["used", "best"]);

  const far = [
    { record: record("best", "Best"), score: 0.01 },
    { record: record("used", "Used"), score: 0.35 },
  ];
  assert.deepEqual(ids(rankSearchResults(far, stats, NOW)), ["best", "used"]);
});
