import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyClipboard,
  collectParameters,
  fieldId,
  initialFormValues,
  matchesFilter,
} from "../parameters";
import {
  PromptFrontMatter,
  PromptParameter,
  PromptRecord,
} from "../prompt-types";

const collect = (
  parameters: PromptParameter[],
  byName: Record<string, unknown>,
) =>
  collectParameters(
    parameters,
    Object.fromEntries(parameters.map((p) => [fieldId(p), byName[p.name]])),
  );

test("empty optional number is omitted, not coerced to 0", () => {
  const { values, errors } = collect([{ name: "count", type: "number" }], {
    count: "",
  });
  assert.equal(values.count, undefined);
  assert.deepEqual(errors, []);
});

test("empty required number is reported missing", () => {
  const { errors } = collect(
    [{ name: "count", type: "number", required: true }],
    { count: "  " },
  );
  assert.deepEqual(errors, ["Missing required: count"]);
});

test("non-numeric number input is an error", () => {
  const { errors } = collect(
    [{ name: "count", type: "number", label: "Count" }],
    { count: "abc" },
  );
  assert.deepEqual(errors, ["Count must be a number"]);
});

test("whitespace-only required text is missing; all missing fields listed together", () => {
  const { errors } = collect(
    [
      { name: "a", type: "text", required: true },
      { name: "b", type: "string", required: true, label: "Bee" },
    ],
    { a: "   " },
  );
  assert.deepEqual(errors, ["Missing required: a, Bee"]);
});

test("regex mismatch is an error; invalid regex is ignored", () => {
  const params: PromptParameter[] = [
    { name: "ticket", type: "string", regex: "^[A-Z]+-\\d+$" },
    { name: "broken", type: "string", regex: "([" },
  ];
  assert.deepEqual(collect(params, { ticket: "abc", broken: "x" }).errors, [
    "ticket does not match required pattern",
  ]);
  assert.deepEqual(
    collect(params, { ticket: "ABC-12", broken: "x" }).errors,
    [],
  );
});

test("array input is split on the delimiter and trimmed", () => {
  const { values } = collect(
    [{ name: "tags", type: "array", delimiter: "," }],
    { tags: " a, b ,, c " },
  );
  assert.deepEqual(values.tags, ["a", "b", "c"]);
});

test("date input is normalized to ISO", () => {
  const { values } = collect([{ name: "due", type: "date" }], {
    due: new Date("2024-01-02T03:04:05Z"),
  });
  assert.equal(values.due, "2024-01-02T03:04:05.000Z");
});

test("clipboard text prefills only the first free-text parameter without a default", () => {
  const params: PromptParameter[] = [
    { name: "body", type: "text" },
    { name: "extra", type: "string" },
  ];
  const values = initialFormValues(params, { kind: "text", text: "clip" });
  assert.equal(values["param-body"], "clip");
  assert.equal(values["param-extra"], "");
});

test("a default wins over clipboard prefill; non-text first params are never prefilled", () => {
  assert.equal(
    initialFormValues([{ name: "b", type: "text", default: "dflt" }], {
      kind: "url",
      text: "https://x.io",
    })["param-b"],
    "dflt",
  );
  assert.equal(
    initialFormValues([{ name: "mode", type: "enum", options: ["a"] }], {
      kind: "text",
      text: "clip",
    })["param-mode"],
    "",
  );
});

test("array defaults round-trip through the form and back to the same list", () => {
  const params: PromptParameter[] = [
    { name: "items", type: "array", default: ["x", "y"] },
  ];
  const { values, errors } = collectParameters(
    params,
    initialFormValues(params, { kind: "empty" }),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(values.items, ["x", "y"]);
});

test("classifyClipboard prefers files, detects URLs, and does not treat dotted text as a URL", () => {
  assert.deepEqual(classifyClipboard({ file: "/tmp/a.pdf", text: "a.pdf" }), {
    kind: "file",
    file: "/tmp/a.pdf",
  });
  assert.equal(
    classifyClipboard({ text: " https://example.com/x " }).kind,
    "url",
  );
  assert.equal(classifyClipboard({ text: "www.example.com" }).kind, "url");
  assert.equal(classifyClipboard({ text: "3.14" }).kind, "text");
  assert.equal(classifyClipboard({ text: "README.md" }).kind, "text");
  assert.equal(classifyClipboard({ text: "  " }).kind, "empty");
});

function recordWithFrontMatter(
  frontMatter: Partial<PromptFrontMatter>,
): PromptRecord {
  return {
    id: "p.md",
    filePath: "/p/p.md",
    relativePath: "p.md",
    rootPath: "/p",
    tags: [],
    frontMatter: { schema_version: 1, title: "P", ...frontMatter },
    content: "",
    validationIssues: [],
  };
}

test("matchesFilter uses explicit preferences, requires_file, and parameter hints", () => {
  assert.equal(
    matchesFilter(
      recordWithFrontMatter({ preferred_clipboard_types: ["url"] }),
      "url",
    ),
    true,
  );
  assert.equal(
    matchesFilter(recordWithFrontMatter({ requires_file: true }), "file"),
    true,
  );
  assert.equal(
    matchesFilter(recordWithFrontMatter({ requires_file: true }), "url"),
    false,
  );
  assert.equal(
    matchesFilter(
      recordWithFrontMatter({
        parameters: [{ name: "page_link", type: "string" }],
      }),
      "url",
    ),
    true,
  );
  assert.equal(
    matchesFilter(
      recordWithFrontMatter({
        parameters: [{ name: "topic", type: "string" }],
      }),
      "url",
    ),
    false,
  );
});
