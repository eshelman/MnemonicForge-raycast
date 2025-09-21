/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Prompts Folder - Absolute path to your prompt_templates directory (e.g., /Users/you/.../prompt_templates). */
  "promptsPath": string,
  /** Paste After Copy - Automatically paste rendered output after it is copied. */
  "pasteAfterCopy": boolean,
  /** Enable OpenAI Send - Allow prompts to be sent directly to OpenAI when ⌘↵ is pressed. */
  "enableSend": boolean,
  /** Default OpenAI Model - Model name used when sending prompts (overridden by prompt metadata). */
  "openaiModel"?: string,
  /** Default Temperature - Temperature value used for OpenAI sends when not specified in a prompt. */
  "openaiTemperature"?: string,
  /** Default Max Tokens - Maximum tokens requested from OpenAI when not set in a prompt. */
  "openaiMaxTokens"?: string,
  /** Capture Clipboard by Default - Include current clipboard text in the contextual data sent to prompts. */
  "contextDefaultClipboard": boolean,
  /** Capture Selected Text by Default - Automatically capture the current text selection as context. */
  "contextDefaultSelection": boolean,
  /** Capture Frontmost App by Default - Include the name and bundle ID of the active application in context. */
  "contextDefaultApp": boolean,
  /** Capture Current Date by Default - Add the current ISO8601 timestamp to the prompt context. */
  "contextDefaultDate": boolean,
  /** Enable Debug Logging - Emit verbose logs to Raycast console for troubleshooting. */
  "debugLog": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `browse-prompts` command */
  export type BrowsePrompts = ExtensionPreferences & {}
  /** Preferences accessible in the `run-prompt` command */
  export type RunPrompt = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `browse-prompts` command */
  export type BrowsePrompts = {}
  /** Arguments passed to the `run-prompt` command */
  export type RunPrompt = {}
}

