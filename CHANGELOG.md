# Changelog

## Unreleased
- Rank prompts by how often and how recently you use them (14-day half-life); unused prompts sort alphabetically.
- Quick Render opens the parameter form when required inputs can't be filled from defaults or the clipboard.
- Renamed the `date` Handlebars helper to `formatDate` so `{{date}}` renders the captured date instead of an empty string.
- Prompt parameters now take precedence over built-in template names (fixes Email Composer's `context` parameter rendering as `[object Object]`).
- `{{date}}` is always available; removed the Capture Current Date preference.
- Rewrote PROMPT_SPEC to match actual template variables and helpers; folded design principles and backlog into the README.
- Dropped Windows from supported platforms (macOS only).
- Added GitHub Actions CI running lint, typecheck, and tests.
- Fixed the Configure Prompt form crashing on submit (leftover `setValidationErrors` references).
- Fixed OpenAI send to use the Responses API `input` field; temperature/max tokens are only sent when configured.
- Fixed deleted prompts lingering in the list, and cached prompts now show instantly while the folder rescans.
- Fixed `join`/`indent`/`date` Handlebars helpers ignoring their defaults and options.
- Fixed empty optional number parameters being rendered as `0`.
- "Render Without Copy" is now "Preview Render" and shows the output instead of discarding it.
- OpenAI responses open in a preview with copy actions.
- Added `npm test` (node:test + tsx) with coverage for parsing, parameters, attachments, and rendering.
- Consolidated Browse and Run commands into a single Prompts command with configurable parameter form and quick render.
- Added optional external editor integration for opening prompt files.
- Align project structure with official Raycast template (`$schema`, platforms, linting, TypeScript updates).
- Added ESLint configuration, README, and change log for the extension package.
