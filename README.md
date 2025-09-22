# MnemonicForge Raycast Extension

Browse, search, and run prompts from the MnemonicForge library directly inside Raycast. The commands in this extension let you keep prompts versioned in git while offering a native desktop launch experience.

## Command

- **Prompts** – Fuzzy-search the prompt library, quickly render & copy with defaults, edit templates in your preferred editor, and push into a full parameter form to copy or send to OpenAI.

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
- `External Editor` – Optional command (for example `subl` or `code`) used when opening prompt files from Raycast.

You can store an OpenAI API key via the **Manage OpenAI API Key** action while running a prompt. Use Raycast’s extension preferences (⌘, → Extensions → Mnemonic Forge) or the in-command “Open Extension Preferences” action to tweak defaults.

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
