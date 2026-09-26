# MnemonicForge Raycast Extension

Browse, search, and run customizable prompts with Raycast. Keep prompts versioned in git while launching easily and quickly.

**[Prompt File Specification](PROMPT_SPEC.md)** - How to write prompt templates with YAML front matter and Handlebars templating.

## Command

**Prompts** – Fuzzy-search the prompt library (ranked by how often and how recently you use each prompt), quick-render and
copy/paste with defaults, fill in a parameter form, preview the output, or send it to OpenAI.

| Where | Key | Action |
|-------|-----|--------|
| List | `↵` | Configure prompt (or Render & Copy when it has no parameters) |
| List | `⌃↵` | Quick Render & Copy — opens the form if required inputs are missing |
| Form | `⌘↵` | Render & Copy (pastes when **Paste After Copy** is on) |
| Form | `⌥↵` | Render, copy only |
| Form | `⌘Y` | Preview render |
| Form | `⌘⌥↵` | Send with OpenAI (when enabled) |

## Requirements

- macOS with a current Raycast release
- Node.js 22+ for development

## Local Development

```bash
cd raycast-extension
npm install
npm run dev
```

Raycast hot-reloads the extension while `npm run dev` is running. If Raycast later reports
"Missing executable. You might need to build the extension.", run `npm run build` (or restart `npm run dev`).

Before opening a pull request (CI runs lint, typecheck, and tests on every push):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Preferences

- `Prompts Folder` – Absolute path to your prompt library.
- `Paste After Copy` – Automatically paste rendered output (and any attachments) into the frontmost app.
- `Enable OpenAI Send` – Show the **Send with OpenAI** action.
- `OpenAI API Key` / `API Endpoint` / default model, temperature, and max tokens – Used when sending.
  Temperature and max tokens are only sent when set, since reasoning models reject custom temperatures.
- Capture toggles – Expose clipboard text, selected text, and the frontmost app to templates. The current date is always available.
- `External Editor` – Optional command (for example `subl` or `code`) used when opening prompt files.

Open preferences via Raycast Settings → Extensions → Mnemonic Forge, or the **Open Extension Preferences** action.

## Principles

- **Local-first:** prompts are plain files; no network calls unless you explicitly send to OpenAI.
- **Clipboard-first:** the default action renders and copies (and pastes); sending is opt-in.
- **Keyboard-centric:** every action is reachable from the list or form without the mouse.
- **Private by default:** context capture is opt-in per source; API keys live in Raycast's secure preference storage
  and are never logged.
- **Simple templating:** Markdown + YAML front matter + Handlebars, validated by a JSON Schema — no custom DSL.

Out of scope for now: multi-message prompts (system/assistant roles), prompt chains, and team/cloud sync.

## Backlog

- Raycast AI (`AI.ask`) as a send target — no API key needed for Raycast Pro, supports streaming.
- Inline form validation via field `error` props instead of a failure toast.
- Report unexpected errors with `captureException` for the Developer Hub.
- Normalize code fences in rendered output.
- Additional providers (Anthropic, Ollama).
- Multi-part messages and per-template send configuration.
- A library linter command, and a test bench with side-by-side render and token estimate.
- Raycast Store submission.

## Folder Structure

```text
raycast-extension/
├── assets/              # Icons used in Raycast commands
├── src/                 # Command, UI, and rendering code
│   └── __tests__/       # node:test suites (npm test)
├── prompt.schema.json   # Front matter JSON Schema
├── eslint.config.js     # Raycast ESLint configuration
├── tsconfig.json        # TypeScript compiler settings
└── package.json         # Raycast manifest & npm dependencies
```

## Publishing

This extension is not yet published to the Raycast Store. Use `npm run build` to produce a production bundle and follow
Raycast's submission guidelines when you are ready.
