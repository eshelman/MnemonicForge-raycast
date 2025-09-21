# Repository Guidelines

## Project Structure & Module Organization
MnemonicForge houses a shared prompt library plus a Raycast extension that lets teammates discover and execute prompts from the desktop. Place prompt source files under `prompt_templates/`, with outbound report shells under `output_templates/`. Raycast extension code belongs in `raycast-extension/` (create it if absent); store command source in `src/`, configuration in `package.json`, and static assets under `assets/`. The `utilities/` directory contains manual helper scripts for humans performing reviews or migrations—agents must not call them.

## Build, Test, and Development Commands
Run `cd raycast-extension && npm install` the first time to prepare the Raycast workspace. Use `npm run dev` inside that folder to launch live preview in the Raycast Development environment, and `npm run lint` before opening a pull request to ensure the TypeScript stays clean. For prompt verification, render templates via your preferred LLM client or Raycast command, then capture behavioral notes in your working branch. When scripts in `utilities/` are needed, execute them manually and paste any results into the PR; do not wire them into automated flows.

## Handlebars & Naming Conventions
Author prompts in Markdown with Handlebars placeholders (e.g., `{{topic}}`, `{{#each personas}}`). Document each variable either inline or in the Raycast command description so users know what to supply. Use Title-Case filenames with hyphen separators, and keep sections short, scannable, and capped near 120 characters per line. For Raycast, match the command naming scheme `mnemonicforge-*` to group actions in the palette.

## Testing Guidelines
Exercise every new prompt by running the corresponding Raycast command and by pasting the rendered Handlebars output into an LLM session. Capture unexpected behaviors as TODOs or PR comments. For the extension, rely on Raycast’s preview plus any Jest or integration tests you add; run them via `npm test`. Always confirm the build passes in production mode with `npm run build` before tagging a release.

## Commit & Pull Request Guidelines
Write succinct, imperative commit messages (e.g., `Add Raycast search command`). Group prompt edits and extension code separately when possible for easier review. Pull requests should outline the scenario tested, list Raycast or LLM commands run, include screenshots or recordings of the Raycast UI when visuals changed, and mention any new Handlebars parameters introduced.

## Agent-Specific Instructions
Agents may edit prompts, Raycast source, and documentation, but they must not execute anything under `utilities/`. Instead, leave clear instructions for human reviewers if those scripts should be run, and link to relevant results when provided.
