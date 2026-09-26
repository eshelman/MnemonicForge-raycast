# Prompt File Specification

Prompts are Markdown files with YAML front matter. The extension indexes files with extensions: `.md`, `.markdown`, `.mdx`, `.txt`, `.yaml`, `.yml`.
Hidden folders (starting with `.`) and `node_modules` are skipped.

## Minimal Example

```markdown
---
schema_version: 1
title: Summarize Text
---
Summarize the following text in 3 bullet points:

{{clipboard}}
```

`{{clipboard}}` is only filled when **Capture Clipboard** is enabled in the extension preferences (see [Context Variables](#context-variables)).

## Full Example

```markdown
---
schema_version: 1
title: Code Review
description: Review code for bugs, style issues, and improvements
tags:
  - development
  - review
parameters:
  - name: focus_area
    type: enum
    label: Focus Area
    options:
      - Security
      - Performance
      - Readability
    default: Readability
  - name: additional_context
    type: text
    label: Additional Context
    required: false
model:
  provider: openai
  name: gpt-4o
  temperature: 0.3
  max_tokens: 2000
preferred_clipboard_types:
  - text
  - file
---
Review this code with a focus on {{focus_area}}.

{{#if additional_context}}
Additional context: {{additional_context}}
{{/if}}

Reviewed on {{formatDate date "en-US" dateStyle="long"}}.

Code to review:
{{clipboard}}
```

## Front Matter Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_version` | `1` | Yes | Must be `1` |
| `title` | string | Yes | Display name in Raycast |
| `description` | string | No | Shown in search results |
| `tags` | string[] | No | For filtering and search |
| `parameters` | Parameter[] | No | User inputs (see below) |
| `model` | ModelConfig | No | OpenAI settings; `temperature`/`max_tokens` are only sent when set |
| `comments` | string[] | No | Author notes (not rendered) |
| `files_to_paste` | string[] | No | Files (relative to the prompts folder, must stay inside it) pasted after the text |
| `requires_file` | boolean | No | Lists the prompt under the **File Prompts** filter |
| `preferred_clipboard_types` | (`text`\|`url`\|`file`)[] | No | Lists the prompt under the matching clipboard filter |

Unknown fields fail validation; invalid prompts show an **Invalid metadata** tag and can't be rendered.

## Parameter Types

| Type | Raycast Control | Notes |
|------|-----------------|-------|
| `string` | TextField | TextArea when `multiline: true` |
| `text` | TextArea | Always multi-line |
| `enum` | Dropdown | Requires `options`; falls back to TextField without them |
| `number` | TextField | Must parse as a number; empty optional values are omitted |
| `boolean` | Checkbox | True/false toggle |
| `date` | DatePicker | Rendered as an ISO timestamp |
| `array` | TextArea | Split on `delimiter` (default `;`), entries trimmed |

Parameter properties: `name` (required, `^[a-zA-Z_][a-zA-Z0-9_]*$`), `type` (required), `label`, `required`, `default`,
`options` (enum), `regex` (validates `string`/`text` input), `multiline` (`string` only), `delimiter` (`array` only).

When the clipboard holds text, it prefills the **first** parameter if that parameter is `string` or `text` and has no default.
**Quick Render** uses defaults plus that prefill; if a required value is still missing, the form opens instead.

## Template Variables

Templates use [Handlebars](https://handlebarsjs.com/) syntax with HTML escaping disabled.

### Parameters

Each parameter is available by name (`{{focus_area}}`) and under `{{parameters.focus_area}}`.
A parameter always wins over a built-in variable with the same name.

### Context Variables

| Variable | Description | Availability |
|----------|-------------|--------------|
| `{{date}}` | Current time as an ISO timestamp (UTC) | Always |
| `{{clipboard}}` | Clipboard text | **Capture Clipboard** preference |
| `{{selection}}` | Selected text in the frontmost app | **Capture Selected Text** preference |
| `{{application.name}}` | Frontmost app name | **Capture Frontmost App** preference |
| `{{application.bundleId}}` | Frontmost app bundle ID | **Capture Frontmost App** preference |

Context values are also available under `{{context.*}}` (e.g. `{{context.clipboard}}`).
Disabled or unavailable sources render as empty, so wrap optional ones in `{{#if clipboard}}…{{/if}}`.

### Other Built-ins

| Variable | Description |
|----------|-------------|
| `{{metadata.title}}` etc. | Any front matter field |
| `{{tags}}` | Combined folder + front matter tags |

## Helpers

Built-in block helpers: `{{#if}}`, `{{#unless}}`, `{{#each}}`, `{{#with}}`. Custom helpers:

| Helper | Example | Result |
|--------|---------|--------|
| `uppercase` | `{{uppercase name}}` | `ADA` |
| `lowercase` | `{{lowercase name}}` | `ada` |
| `join` | `{{join items}}` / `{{join items " \| "}}` | `a, b` / `a \| b` |
| `indent` | `{{indent body}}` / `{{indent body 4}}` | Every line indented 2 (or N) spaces |
| `nl2br` | `{{nl2br body}}` | Newlines replaced with `<br />` |
| `formatDate` | `{{formatDate date "en-GB" dateStyle="long"}}` | `25 September 2026` |

`formatDate` takes an optional locale (default `en-US`); named arguments are passed to
[`Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat#options)
(`dateStyle`, `timeStyle`, `year`, `month`, `weekday`, `timeZone`, …).

## Output

Rendered output has Windows line endings normalized, trailing whitespace stripped from each line, and trailing blank lines removed.
Lines are never re-wrapped.

## Directory Structure & Tags

Folder names become automatic tags. A prompt at `prompts/coding/python/debug.md` gets tags `coding` and `python` in addition to any `tags` in front matter.

## JSON Schema

The canonical machine-readable schema is at [`raycast-extension/prompt.schema.json`](raycast-extension/prompt.schema.json).
