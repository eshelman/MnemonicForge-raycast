# MnemonicForge Raycast Extension

Browse, search, and run prompts from the MnemonicForge library directly inside Raycast. The commands in this extension let you keep prompts versioned in git while offering a native desktop launch experience.

## Commands

- **Browse Prompts** – Fuzzy-search the prompt library, preview metadata, and open files in your editor.
- **Run Prompt** – Fill in front-matter parameters, auto-capture context (clipboard, selection, app, date), render the template, copy results, or send to OpenAI.

## Requirements

- Raycast 1.84 or newer
- Node.js 18+

## Local Development

```bash
cd raycast-extension
npm install
npm run dev
```

Raycast will hot-reload the extension via the Raycast Development environment. Run linting and type-checks before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run build
```

## Preferences

All commands share the following preferences:

- `Prompts Folder` – Absolute path to your `prompt_templates` directory.
- `Paste After Copy` – Automatically paste rendered output.
- `Enable OpenAI Send` and related defaults – Configure OpenAI sends triggered with `⌘↵`.
- Context capture toggles – Collect clipboard/selection/app/date data for templates.

You can store an OpenAI API key via the **Manage OpenAI API Key** action while running a prompt.

## Folder Structure

```text
raycast-extension/
├── assets/              # Icons used in Raycast commands
├── src/                 # Command implementations and helpers
├── eslint.config.js     # Raycast ESLint configuration
├── tsconfig.json        # TypeScript compiler settings
└── package.json         # Raycast manifest & npm dependencies
```

## Publishing

This extension is not yet published to the Raycast Store. Use `ray build` to produce a production bundle and follow Raycast’s submission guidelines when you are ready.
