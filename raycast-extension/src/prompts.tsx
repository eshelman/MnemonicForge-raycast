import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  classifyClipboard,
  ClipboardFilter,
  ClipboardSnapshot,
  collectParameters,
  defaultFilterFor,
  initialFormValues,
  matchesFilter,
} from "./parameters";
import { OpenPromptAction, PromptForm } from "./prompt-form";
import { PromptRecord } from "./prompt-types";
import { errorMessage, renderAndCopy } from "./render";
import { rankForBrowse, rankSearchResults, UsageStats } from "./usage";
import { loadUsage } from "./usage-storage";
import { usePromptIndex } from "./use-prompt-index";

const PLACEHOLDERS: Record<ClipboardFilter, string> = {
  none: "Search prompts",
  url: "Prompts requesting a URL",
  file: "Prompts expecting a file",
};

export default function PromptsCommand() {
  const preferences = getPreferenceValues<Preferences.Prompts>();
  const { isLoading, error, records, search } = usePromptIndex(
    preferences.promptsPath,
  );
  const [searchText, setSearchText] = useState("");
  const [clipboard, setClipboard] = useState<ClipboardSnapshot>({
    kind: "empty",
  });
  const [filter, setFilter] = useState<ClipboardFilter>("none");
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const { push } = useNavigation();

  useEffect(() => {
    loadUsage()
      .then(setUsage)
      .catch((caught) => {
        console.warn("Failed to load prompt usage", caught);
        setUsage({});
      });
  }, []);

  useEffect(() => {
    Clipboard.read()
      .then((content) => {
        const snapshot = classifyClipboard(content);
        setClipboard(snapshot);
        setFilter(defaultFilterFor(snapshot));
      })
      .catch((caught) => console.warn("Clipboard analysis failed", caught));
  }, []);

  useEffect(() => {
    if (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Prompt index unavailable",
        message: error,
      });
    }
  }, [error]);

  const visible = useMemo(() => {
    const stats = usage ?? {};
    const now = Date.now();
    const query = searchText.trim();
    if (query) {
      return rankSearchResults(search(query), stats, now);
    }
    const filtered =
      filter === "none"
        ? records
        : records.filter((record) => matchesFilter(record, filter));
    return rankForBrowse(filtered.length ? filtered : records, stats, now);
  }, [records, searchText, search, filter, usage]);

  const onSearchTextChange = (text: string) => {
    setSearchText(text);
    setFilter(text.trim() ? "none" : defaultFilterFor(clipboard));
  };

  const quickRender = async (record: PromptRecord) => {
    const parameters = record.frontMatter?.parameters ?? [];
    const values = initialFormValues(parameters, clipboard);
    if (collectParameters(parameters, values).errors.length) {
      push(<PromptForm record={record} clipboard={clipboard} />);
      return;
    }
    try {
      const message = await renderAndCopy(
        record,
        values,
        clipboard,
        preferences.pasteAfterCopy,
        preferences,
      );
      await showHUD(message);
      await popToRoot({ clearSearchBar: true });
    } catch (caught) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Render failed",
        message: errorMessage(caught, "Failed to render prompt"),
      });
    }
  };

  return (
    <List
      searchBarPlaceholder={PLACEHOLDERS[filter]}
      onSearchTextChange={onSearchTextChange}
      isLoading={isLoading || usage === null}
      throttle
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by type"
          value={filter}
          onChange={(value) => setFilter(value as ClipboardFilter)}
        >
          <List.Dropdown.Item title="All Prompts" value="none" />
          <List.Dropdown.Item title="URL Prompts" value="url" />
          <List.Dropdown.Item title="File Prompts" value="file" />
        </List.Dropdown>
      }
    >
      <List.EmptyView
        title={error ? "Prompt index unavailable" : "No prompts found"}
        description={
          error ?? "Add prompt files to your library to see them here."
        }
        icon={error ? Icon.Warning : Icon.TextDocument}
      />
      {visible.map((record) => (
        <PromptItem
          key={record.id}
          record={record}
          clipboard={clipboard}
          onQuickRender={quickRender}
        />
      ))}
    </List>
  );
}

function PromptItem({
  record,
  clipboard,
  onQuickRender,
}: {
  record: PromptRecord;
  clipboard: ClipboardSnapshot;
  onQuickRender: (record: PromptRecord) => void;
}) {
  const title = record.frontMatter?.title ?? record.relativePath;
  const issues = record.validationIssues
    .map((issue) =>
      issue.path ? `${issue.message} (${issue.path})` : issue.message,
    )
    .join("\n");
  const accessories: List.Item.Accessory[] = [];
  if (issues) {
    accessories.push({
      tag: { value: "Invalid metadata", color: Color.Red },
      tooltip: issues,
    });
  }
  if (record.tags.length) {
    accessories.push({ text: record.tags.join(", ") });
  }

  const form = <PromptForm record={record} clipboard={clipboard} />;
  const hasParameters = Boolean(record.frontMatter?.parameters?.length);

  return (
    <List.Item
      title={title}
      subtitle={record.frontMatter?.description}
      icon={issues ? Icon.Warning : Icon.Document}
      accessories={accessories}
      quickLook={{ path: record.filePath, name: title }}
      actions={
        <ActionPanel>
          {hasParameters ? (
            <>
              <Action.Push
                title="Configure Prompt"
                icon={Icon.Pencil}
                target={form}
              />
              <Action
                title="Quick Render & Copy"
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["ctrl"], key: "enter" }}
                onAction={() => onQuickRender(record)}
              />
            </>
          ) : (
            <>
              <Action
                title="Render & Copy"
                icon={Icon.Clipboard}
                onAction={() => onQuickRender(record)}
              />
              <Action.Push
                title="Open Prompt Options"
                icon={Icon.Sidebar}
                target={form}
              />
            </>
          )}
          <OpenPromptAction filePath={record.filePath} />
          <Action.ShowInFinder path={record.filePath} />
          <Action.ToggleQuickLook
            shortcut={Keyboard.Shortcut.Common.ToggleQuickLook}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    />
  );
}
