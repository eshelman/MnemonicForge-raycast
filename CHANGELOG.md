# Changelog

## Unreleased
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
