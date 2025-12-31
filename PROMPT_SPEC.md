# Prompt File Specification

Prompts are Markdown files with YAML front matter. The extension indexes files with extensions: `.md`, `.markdown`, `.mdx`, `.txt`, `.yaml`, `.yml`.

## Minimal Example

```markdown
---
schema_version: 1
title: Summarize Text
---
Summarize the following text in 3 bullet points:

{{clipboard}}
```

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
    multiline: true
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
| `model` | ModelConfig | No | OpenAI model settings |
| `comments` | string[] | No | Author notes (not rendered) |
| `files_to_paste` | string[] | No | Relative paths to attach |
| `requires_file` | boolean | No | Require file in clipboard |
| `preferred_clipboard_types` | (`text`\|`url`\|`file`)[] | No | Filter by clipboard content |

## Parameter Types

| Type | Raycast Control | Notes |
|------|-----------------|-------|
| `string` | TextField | Single line input |
| `text` | TextArea | Multi-line when `multiline: true` |
| `enum` | Dropdown | Requires `options` array |
| `number` | TextField | Numeric input |
| `boolean` | Checkbox | True/false toggle |
| `date` | DatePicker | ISO date string |
| `array` | TextField | Split by `delimiter` (default: `;`) |

Parameter properties: `name` (required), `type` (required), `label`, `required`, `default`, `options` (for enum), `regex` (validation), `multiline`, `delimiter`.

## Template Variables

Templates use [Handlebars](https://handlebarsjs.com/) syntax. Available context variables:

| Variable | Description |
|----------|-------------|
| `{{clipboard}}` | Current clipboard text |
| `{{selection}}` | Selected text (if captured) |
| `{{url}}` | URL from clipboard |
| `{{filePaths}}` | Array of file paths |
| `{{currentDate}}` | ISO timestamp |
| `{{currentApp}}` | Frontmost application name |
| Parameter names | Values from form inputs |

Handlebars helpers: `{{#if}}`, `{{#each}}`, `{{#unless}}`, `{{#with}}`.

## Directory Structure & Tags

Folder names become automatic tags. A prompt at `prompts/coding/python/debug.md` gets tags `coding` and `python` in addition to any `tags` in front matter.

## JSON Schema

The canonical machine-readable schema is at [`raycast-extension/prompt.schema.json`](raycast-extension/prompt.schema.json).
