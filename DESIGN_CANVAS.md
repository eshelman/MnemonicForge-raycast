**Key takeaways (based on your answers)**

* **Platform:** Start as a **Raycast extension**. One root folder `prompt_templates`; nested folders auto-map to **tags**.
* **Templates:** **Markdown + YAML front‑matter** with **Handlebars** placeholders; validated by a **JSON Schema** in repo root.
* **UX:** Fuzzy search from first keystroke (title > body) → results ranked by score then recency; special keyword **“favorite”** surfaces favorites. Preview shows the **unrendered template** so parameters are visible.
* **Run actions:** **Clipboard-first workflow** and **offline by default**. **Enter = Copy** (with a preference “Paste after copy” default **ON** to satisfy “Copy & Paste by default”). **⌘Enter = Send** (OpenAI).
* **Post-processing:** Always **strip trailing spaces**, **normalize code fencing**, **never auto-wrap**.
* **Context:** Safe **auto-inject** (clipboard / selected text / date-time / app) is allowed and controlled by toggles.
* **Security:** API keys in **Raycast secure storage**. Optional local **debug log**.
* **Distribution:** Aim for Raycast Store later; pick reasonable current Node/TS targets.

> **Minor harmonization:** You said “Copy & Paste is default” (#6) and “Return copies the prompt” (#15).
> **Resolution:** Default behavior is **Enter = Copy**; a preference **“Paste after copy”** is **ON by default**, so pressing Enter will *copy and paste*. Add **⌥Enter = Copy only** to override when needed.

---

## ✅ Actionable Design Canvas

# MneumonicForge for Raycast — Design Canvas (v0.1)

**Owner:** Eliot  
**Status:** Draft for implementation  
**Scope:** Raycast extension for fast, parameterized prompt management on macOS

---

## 0) TL;DR

A Raycast extension that indexes a local **`prompt_templates/`** folder of Markdown files with **YAML front‑matter** and **Handlebars** placeholders. Users fuzzy‑search, preview the unrendered template (parameters visible), fill an auto‑generated form, and **Copy/Paste** the hydrated prompt (offline by default). Optional **OpenAI send** is available via ⌘Enter. Secure, local‑first, and keyboard‑centric.

---

## 1) Goals & Non‑Goals

**Goals**
- Lightning‑fast, keyboard‑first prompt retrieval and hydration.
- Zero cloud dependency for prompt management (offline by default).
- Simple, explicit parameterization; no custom DSL.
- Store-ready foundation (later submission).

**Non‑Goals (MVP)**
- Multi-part messages (system/user/assistant); Chains of Prompts
- Team sync, cloud library, or telemetry beyond optional local debug logs.

---

## 2) Library Conventions

**Root:** `prompt_templates/` (required, user-configured).  
**Tag mapping:** Nested folders → tags.  
- Example: `prompt_templates/analysis/code-review/*.md` ⇒ tags: `analysis`, `code-review`.

**File naming:**  
- Slug from filename (kebab-case).  
- Human title from front‑matter.

**Front‑matter keys (MVP)**
```yaml
title: "Draft an outreach email"
description: "Friendly outreach with bullets"
tags: [email, outreach]
parameters:
  - { name: recipient, type: string, required: true, label: "Recipient" }
  - { name: topic,     type: string, required: true }
  - { name: tone,      type: enum, options: ["formal","friendly","concise"], default: "friendly" }
  - { name: bullets,   type: array, delimiter: ";" }   # token chips; default delimiter ';'
model:
  provider: openai          # optional; send is explicit
  name: gpt-latest          # example only
  temperature: 0.2
schema_version: 1
````

**Body:** Markdown with Handlebars placeholders (e.g., `{{recipient}}`, `{{#each bullets}}…{{/each}}`).

**JSON Schema:** Include `prompt.schema.json` at repo root to validate front‑matter (`schema_version: 1`).

---

## 3) Template Syntax & Parameters

* **Engine:** Handlebars (helpers limited to a curated core; no user-defined TS helpers in MVP).
* **Param types:** `string | text | enum | number | boolean | date | array`
* **Array UX:** **Token chips**, default **semicolon** (`;`) delimiter. Allow per-template override via `delimiter`.
* **Preview:** Shows **unrendered** template so placeholders remain visible to the user.
* **Partials:** Supported from `partials/` folder (optional), but no per-template helper/partial packs in MVP.

---

## 4) Search & Ranking

* **Live fuzzy search from first keystroke** across:

  1. **Title** (highest weight)
  2. **Body content** (lower weight)
  3. **Tags**
* **Ranking:** Primary by fuzzy score, secondary by **recency** of last use.
* **Special keyword:** `"favorite"` → lists favorites (also fuzzy-matchable).
* **Indexing:** Cache front‑matter + content excerpt; watch file changes for instant refresh.

---

## 5) UI & Interaction

**Primary commands**

* **Browse Prompts:** List → Preview → Actions.
* **Run Prompt:** Open dynamic Form based on `parameters` and submit.

**Preview panel**

* Shows: title, tags, description, path, and **unrendered body**.

**Form generation**

* Form controls map from parameter types.
* `array` → token chips; default delimiter `;`.
* Required, default values, enum options, and regex validation (if provided).

**Actions & Keybindings**

* **Enter** → **Copy** to clipboard; if preference **“Paste after copy”** is **ON (default)**, also paste to frontmost app.
* **⌥Enter** → **Copy only** (bypasses paste even if the toggle is ON).
* **⌘Enter** → **Send** to the configured provider (OpenAI).
* Additional: Open in editor; Toggle favorite; Show recent runs.

---

## 6) Execution & Post‑Processing

**Pipeline**

1. Validate form inputs.
2. Render via Handlebars with (optional) context auto-injection.
3. **Post‑process (strict):**

   * Strip **all trailing spaces** (per line).
   * Normalize **code fences** to triple backticks; preserve language tags if present.
   * **No auto-wrap**; respect original line lengths.
4. Perform action: Copy / Paste (+Copy) / Send.

**Context auto-inject (user‑controlled)**

* Sources: Clipboard, selected text, current app name, file path/URL (when available), date/time ISO.
* Injection: exposed as optional reserved params (`{{context.clipboard}}`, etc.).
* Defaults: **OFF globally**; per-run toggles available. (Permitted by user requirement.)

---

## 7) Provider Adapter (OpenAI, optional per run)

* **Default mode is offline.** “Send” is explicit (⌘Enter).
* **Message shape:** single **user** string; no system/assistant parts in MVP.
* **Config:** API key stored in **Raycast secure storage**; model name & sampling params from template or defaults.
* **Errors:** Display non-sensitive error toasts + panel details; never log secrets.

---

## 8) Security & Privacy

* Local‑first: no background network calls unless “Send” is invoked.
* API keys: Raycast secure storage; never printed or synced.
* Context data: opt‑in, scoped to a single run, discarded after action.

---

## 9) Preferences (Raycast)

* `promptsPath` (**required**): path to `prompt_templates/`.
* `pasteAfterCopy` (**default: true**).
* `enableSend` (**default: false**) — gates provider actions.
* `openai.model` (string), `openai.temperature` (number), `openai.max_tokens` (number).
* `context.defaults` (booleans): clipboard/selection/app/date.
* `debugLog` (boolean; default off).

---

## 10) Performance & Reliability

* Parse front‑matter on index; lazy-compile bodies on first use.
* File watcher to update index incrementally.
* Cache compiled templates keyed by `path + mtime + size`.
* Graceful handling: malformed YAML, missing parameters, unknown helpers/partials.

---

## 11) Packaging & Targets

* **Runtime target (assumed reasonable):** Node 18 LTS, TypeScript 5.x.
* **Raycast:** Latest stable SDK; extension manifest with required preferences.
* **Distribution:** Private during MVP; **prepare for Store** submission later.

---

## 12) Testing Strategy

* **Unit:** front‑matter parsing, schema validation, helper functions, post‑processing rules.
* **Integration:** folder indexer + watcher, form generation from parameters, search scoring & sort.
* **E2E (Raycast dev mode):** copy, paste, send; failure cases (no frontmost app; network errors).

---

## 13) Definition of Done (MVP)

* Preferences configured; `prompt_templates/` indexed and hot‑reloaded.
* Browse → preview (unrendered) → form → submit → **Copy/Paste** works.
* Post‑processing rules enforced exactly (strip trailing spaces; normalize fences; no wrap).
* Fuzzy search (title > body > tags); sort by score then recency.
* Favorites and recents; “favorite” keyword behavior.
* Optional OpenAI **send** via ⌘Enter; offline by default.
* No secrets in logs; optional local **debug log** toggle.

---

## 14) Implementation Checklists

### A. Scaffolding

* [ ] Initialize Raycast extension (TypeScript).
* [ ] Define manifest with required preferences (`promptsPath`, `pasteAfterCopy`, etc.).
* [ ] Add core deps: YAML/front‑matter parser, Handlebars, file watcher, fuzzy search.

### B. Indexer & Search

* [ ] Scan `promptsPath` recursively; compute tags from folders.
* [ ] Parse front‑matter; validate against `prompt.schema.json`.
* [ ] Build in‑memory index (title, tags, body excerpt).
* [ ] Implement fuzzy search (weighted; score → recency sort).
* [ ] Watch for add/change/remove and update index incrementally.

### C. UI Commands

* [ ] **Browse Prompts** list + preview (unrendered body).
* [ ] **Run Prompt** opens dynamic Form from `parameters`.
* [ ] Favorites & recents; “favorite” keyword behavior.

### D. Rendering & Post‑Processing

* [ ] Compile template with inputs + context.
* [ ] Implement post‑processing: strip trailing spaces; normalize code fences; no wrap.
* [ ] Add helpers (minimal pack: `uppercase`, `lowercase`, `join`, `indent`, `nl2br`, `date`).
* [ ] Optional partials from `partials/`.

### E. Actions

* [ ] **Enter**: Copy; apply Paste if `pasteAfterCopy` is true.
* [ ] **⌥Enter**: Copy only.
* [ ] **⌘Enter**: Send (if `enableSend` and OpenAI key present).
* [ ] Open in editor; toggle favorite.

### F. Provider (OpenAI)

* [ ] Secure storage for API key.
* [ ] Simple “send” with single user message.
* [ ] Surface errors cleanly; redact secrets.

### G. Context Auto‑Inject

* [ ] Toggles for clipboard / selected text / app / date.
* [ ] Expose to templates under `context.*`.
* [ ] Respect privacy (off by default; per-run only).

### H. Logging & QA

* [ ] Optional local debug log (rotating file; redact secrets).
* [ ] Unit + integration + E2E suites.
* [ ] Performance checks on libraries with 500+ templates.

---

## 15) JSON Schema (v1, MVP)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Prompt Front-Matter v1",
  "type": "object",
  "required": ["title", "schema_version"],
  "properties": {
    "schema_version": { "const": 1 },
    "title": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "parameters": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type"],
        "properties": {
          "name": { "type": "string", "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$" },
          "type": { "type": "string", "enum": ["string","text","enum","number","boolean","date","array"] },
          "label": { "type": "string" },
          "required": { "type": "boolean" },
          "default": {},
          "options": { "type": "array", "items": { "type": "string" } },
          "regex": { "type": "string" },
          "multiline": { "type": "boolean" },
          "delimiter": { "type": "string", "default": ";" }
        },
        "additionalProperties": false
      }
    },
    "model": {
      "type": "object",
      "properties": {
        "provider": { "type": "string", "enum": ["openai"] },
        "name": { "type": "string" },
        "temperature": { "type": "number", "minimum": 0, "maximum": 2 },
        "max_tokens": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

---

## 16) Example Template

```markdown
---
title: "Outreach Email"
description: "Friendly outreach with optional bullets"
tags: [email, outreach]
parameters:
  - { name: recipient, type: string, required: true, label: "Recipient" }
  - { name: topic,     type: string, required: true }
  - { name: tone,      type: enum, options: ["formal","friendly","concise"], default: "friendly" }
  - { name: bullets,   type: array, delimiter: ";" }
schema_version: 1
---

Write a {{tone}} email to **{{recipient}}** about *{{topic}}*.
{{#if bullets}}
Cover these points:
{{#each bullets}}- {{this}}
{{/each}}
{{/if}}
```

---

## 17) Risks & Mitigations

* **Conflicting keybindings / default behavior:** Use the “Paste after copy” preference (default ON) + ⌥Enter to copy-only.
* **Template drift and invalid metadata:** Enforce `prompt.schema.json` validation with clear toasts and “Open in Editor.”
* **Large libraries:** Lazy compile; cache compiled templates; content excerpt indexing.
* **Helper creep:** Keep a minimal helper pack; document clearly.

---

## 18) Backlog (Post-MVP)

* Multi-part messages (system/user/assistant) and per-template send config.
* Additional providers (Anthropic, Ollama, Mistral).
* Linter command (`promptx lint`) for library.
* Test-bench view with side-by-side render + token estimate.
* CLI wrapper that reuses the same renderer.
* Store submission checklist pass.


---

### Remaining tiny decisions I assumed (tell me if you want changes)
- **Node/TS targets:** Node 18 LTS, TS 5.x (safe, modern baseline).
- **Helpers in MVP:** a small, built-in pack (`uppercase`, `lowercase`, `join`, `indent`, `nl2br`, `date`).

