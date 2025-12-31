# Raycast API Capability Review

Analysis of Raycast API documentation vs current MnemonicForge implementation.

## What We're Using Well

| Feature | Implementation |
|---------|---------------|
| List with search, EmptyView, accessories | `prompts.tsx` |
| Form with all field types | Parameter forms |
| Detail with markdown/metadata | Preview views |
| Actions (Push, Open, ShowInFinder, CopyToClipboard) | Action panels |
| Toast feedback | Error/success states |
| Clipboard API | Read, copy, paste |
| Preferences API | Extension settings |
| Navigation (popToRoot, Action.Push) | Flow control |

---

## Missed Opportunities

### 1. Raycast AI API (High Value)

Raycast has built-in AI (`AI.ask`) that doesn't require API keys:

```typescript
// Current: Custom OpenAI integration requiring user's API key
// Available: AI.ask("prompt") - works for Raycast Pro users
if (environment.canAccess(AI)) {
  const answer = await AI.ask(prompt, { model: AI.Model.OpenAI_GPT4o });
}
```

**Recommendation**: Offer Raycast AI as default, OpenAI as optional for users who need specific models.

**Benefits**:
- No API key required for Raycast Pro users
- Built-in model selection
- Streaming support via EventEmitter
- Graceful fallback if user lacks access

### 2. Form Drafts (Medium Value)

User loses form input if they exit accidentally:

```typescript
// Could add to PromptFormView:
<Form enableDrafts>
  {/* Form fields */}
</Form>
// With LaunchProps<{ draftValues: FormValues }>
```

**Location**: `prompts.tsx:868` - PromptFormView Form component

### 3. showHUD for Clipboard (Low-Medium Value)

Toast for "Copied to clipboard" is noisy; HUD is designed for this:

```typescript
// Current:
await showToast({ style: Toast.Style.Success, title: "Copied" });

// Better:
await showHUD("Copied to clipboard");  // Closes window + shows compact message
```

HUD automatically hides the main window and shows a compact message at the bottom of the screen - perfect for clipboard operations.

### 4. List.Dropdown Filter (Medium Value)

Already have clipboard-based filtering logic but no UI:

```typescript
<List searchBarAccessory={
  <List.Dropdown tooltip="Filter by type" onChange={setClipboardFilter}>
    <List.Dropdown.Item title="All Prompts" value="none" />
    <List.Dropdown.Item title="URL Prompts" value="url" />
    <List.Dropdown.Item title="File Prompts" value="file" />
  </List.Dropdown>
}>
```

**Location**: `prompts.tsx:247-249` - clipboardFilter state already exists

### 5. Quick Look (Low Value)

Enable native file preview for prompt files:

```typescript
<List.Item
  quickLook={{ path: record.filePath, name: record.frontMatter?.title }}
  actions={
    <ActionPanel>
      <Action.ToggleQuickLook shortcut={Keyboard.Shortcut.Common.ToggleQuickLook} />
    </ActionPanel>
  }
/>
```

### 6. Cache API (Medium Value)

For prompt index persistence across sessions:

```typescript
const cache = new Cache();
cache.set("prompt-index", JSON.stringify(records));
// With LRU eviction and subscription support
```

Benefits over current approach:
- Survives extension restarts
- LRU eviction prevents unbounded growth
- Subscription support for reactive updates

### 7. getSelectedText (Low-Medium Value)

Could auto-populate context from selected text in addition to clipboard:

```typescript
import { getSelectedText } from "@raycast/api";

try {
  const selectedText = await getSelectedText();
  // Use as context or parameter prefill
} catch {
  // No text selected - fallback to clipboard
}
```

### 8. captureException (Medium Value)

Report errors to Developer Hub for debugging:

```typescript
import { captureException } from "@raycast/api";

try {
  // operation
} catch (e) {
  captureException(e);  // Reports to Developer Hub
  showToast({ style: Toast.Style.Failure, ... });
}
```

---

## Anti-Patterns Identified

### 1. API Key Storage (Security - High Priority)

**Current** (`openai-keychain.ts:11`):
```typescript
await LocalStorage.setItem(STORAGE_KEY, apiKey);
```

**Issue**: LocalStorage is unencrypted. The TODO comment at line 11 acknowledges this.

**Fix**: Use `password` type preference in `package.json` manifest - Raycast handles secure storage automatically:

```json
{
  "preferences": [
    {
      "name": "openaiApiKey",
      "type": "password",
      "required": false,
      "title": "OpenAI API Key",
      "description": "Your OpenAI API key for sending prompts"
    }
  ]
}
```

Then access via `getPreferenceValues()` - no custom storage needed.

### 2. Custom Shortcuts vs Standard (UX Consistency)

**Current** (`prompts.tsx:937`):
```typescript
shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
```

**Fix**: Use Raycast's common shortcuts for muscle memory consistency:
```typescript
import { Keyboard } from "@raycast/api";
shortcut={Keyboard.Shortcut.Common.Copy}
```

**Available Common Shortcuts**:
- `Keyboard.Shortcut.Common.Copy` - ⌘⇧C
- `Keyboard.Shortcut.Common.Open` - ⌘O
- `Keyboard.Shortcut.Common.Edit` - ⌘E
- `Keyboard.Shortcut.Common.Refresh` - ⌘R
- `Keyboard.Shortcut.Common.ToggleQuickLook` - ⌘Y

### 3. Form Validation Not Using Error Props (UX)

**Current**: Custom validation shows Toast errors after submit

**Better**: Use Form item `error` prop for inline validation:
```typescript
<Form.TextField
  id="name"
  error={nameError}
  onChange={() => setNameError(undefined)}
  onBlur={(e) => !e.target.value && setNameError("Required")}
/>
```

Or use `useForm` from `@raycast/utils` for declarative validation:
```typescript
import { useForm, FormValidation } from "@raycast/utils";

const { handleSubmit, itemProps } = useForm<FormValues>({
  onSubmit(values) { /* ... */ },
  validation: {
    name: FormValidation.Required,
    email: (value) => {
      if (!value?.includes("@")) return "Invalid email";
    },
  },
});
```

### 4. Read-Only TextArea Anti-Pattern

**Current** (`prompts.tsx:1005-1010`):
```typescript
<Form.TextArea
  id="promptContentPreview"
  title="Prompt Content"
  value={promptContent}
  onChange={() => {}}  // No-op to make it "read-only"
/>
```

**Better**: Use `Form.Description` for display-only content, or use a Detail view with markdown.

---

## Summary

| Category | Status | Priority |
|----------|--------|----------|
| Core UI Components | Well utilized | - |
| AI Integration | Could leverage Raycast AI | High |
| Form UX | Missing drafts, inline validation | Medium |
| Feedback | Toast overused vs HUD | Low |
| Security | API key storage needs fix | High |
| Keyboard shortcuts | Should use Common shortcuts | Low |
| Filtering | Has logic, missing UI (Dropdown) | Medium |

## Top Recommendations

### Immediate (High Priority)

1. **Move API key to password preference** - Security fix, simplifies code
2. **Add Raycast AI option** - No API key needed for Pro users, better UX

### Short-term (Medium Priority)

3. **Add `enableDrafts` to Form** - Preserve user input on accidental exit
4. **Add List.Dropdown for filtering** - Expose existing filter logic via UI
5. **Use `useForm` for validation** - Inline errors instead of Toast

### Nice-to-have (Low Priority)

6. **Use `showHUD` for clipboard operations** - More subtle feedback
7. **Use `Keyboard.Shortcut.Common`** - Consistency with other extensions
8. **Add Quick Look support** - Preview prompt files without opening
9. **Add `captureException`** - Better production debugging
