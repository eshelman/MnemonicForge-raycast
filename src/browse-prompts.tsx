import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getExtensionPreferences } from "./preferences";
import { getPromptIndex, PromptSearchResult } from "./prompt-index";

export default function BrowsePromptsCommand() {
  const { promptsPath } = getExtensionPreferences();
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<PromptSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const [indexRevision, setIndexRevision] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    async function initialize() {
      if (!promptsPath) {
        setErrorMessage("Set the Prompts Folder preference to your prompt_templates directory.");
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setIndexReady(false);
      setErrorMessage(null);
      setIndexRevision(0);

      try {
        const index = await getPromptIndex(promptsPath);
        if (!isMounted) {
          return;
        }

        setIndexReady(true);
        setResults(index.search(""));
        unsubscribe = index.subscribe(() => {
          if (!isMounted) {
            return;
          }
          setIndexRevision((revision) => revision + 1);
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to index prompts.";
        setErrorMessage(message);
        setResults([]);
        await showToast({ style: Toast.Style.Failure, title: "Failed to index prompts", message });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [promptsPath]);

  useEffect(() => {
    if (!promptsPath || errorMessage || !indexReady) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const index = await getPromptIndex(promptsPath);
        if (cancelled) {
          return;
        }
        setResults(index.search(searchText));
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Search failed.";
        setErrorMessage(message);
        await showToast({ style: Toast.Style.Failure, title: "Search failed", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchText, promptsPath, indexRevision, indexReady, errorMessage]);

  const emptyView = errorMessage ? (
    <List.EmptyView title="Prompt index unavailable" description={errorMessage} icon={Icon.Warning} />
  ) : (
    <List.EmptyView
      title="No prompts found"
      description={promptsPath ? "Add prompt files to your library to see them here." : "Configure the Prompts Folder preference."}
      icon={Icon.TextDocument}
    />
  );

  return (
    <List
      searchBarPlaceholder="Search prompts"
      onSearchTextChange={setSearchText}
      isLoading={isLoading}
      throttle
    >
      {results.length === 0 ? (
        emptyView
      ) : (
        results.map(({ record }) => {
          const accessories = [] as List.Item.Accessory[];
          if (record.tags.length) {
            accessories.push({ text: record.tags.join(", ") });
          }
          if (record.validationIssues.length) {
            accessories.push({ tag: { value: "Needs metadata", color: "red" } });
          }

          return (
            <List.Item
              key={record.id}
              icon={record.validationIssues.length ? Icon.Warning : Icon.Document}
              title={record.frontMatter?.title ?? record.relativePath}
              subtitle={record.frontMatter?.description}
            accessories={accessories}
            detail={
              <List.Item.Detail
                markdown={`**Path:** ${record.relativePath}\n\n${record.excerpt || "(empty file)"}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Last Modified" text={record.modifiedAt.toLocaleString()} />
                    {record.tags.length ? (
                      <List.Item.Detail.Metadata.TagList title="Tags">
                        {record.tags.map((tag) => (
                          <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
                        ))}
                      </List.Item.Detail.Metadata.TagList>
                    ) : null}
                    {record.validationIssues.length ? (
                      <List.Item.Detail.Metadata.Separator />
                    ) : null}
                    {record.validationIssues.map((issue, index) => (
                      <List.Item.Detail.Metadata.Label
                        key={`${issue.message}-${index}`}
                        title="Validation"
                        text={issue.path ? `${issue.message} (${issue.path})` : issue.message}
                      />
                    ))}
                  </List.Item.Detail.Metadata>
                }
              />
              }
              actions={
                <ActionPanel>
                  <Action.Open title="Open Prompt" target={record.filePath} />
                  <Action.ShowInFinder title="Reveal in Finder" path={record.filePath} />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
