import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { getExtensionPreferences } from "./preferences";
import { PromptSearchResult } from "./prompt-index";
import { usePromptIndex } from "./use-prompt-index";

export default function BrowsePromptsCommand() {
  const { promptsPath } = getExtensionPreferences();
  const [searchText, setSearchText] = useState("");
  const { isLoading, error, records, hasIndex, search } =
    usePromptIndex(promptsPath);

  useEffect(() => {
    if (error && promptsPath) {
      showToast({
        style: Toast.Style.Failure,
        title: "Prompt index unavailable",
        message: error,
      });
    }
  }, [error, promptsPath]);

  const results: PromptSearchResult[] = useMemo(() => {
    if (!hasIndex || error) {
      return [];
    }

    if (!searchText.trim()) {
      return records.map((record, index) => ({ record, score: index }));
    }

    return search(searchText);
  }, [hasIndex, error, records, searchText, search]);

  const emptyView = error ? (
    <List.EmptyView
      title="Prompt index unavailable"
      description={error}
      icon={Icon.Warning}
    />
  ) : (
    <List.EmptyView
      title="No prompts found"
      description={
        promptsPath
          ? "Add prompt files to your library to see them here."
          : "Configure the Prompts Folder preference."
      }
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
      {results.length === 0
        ? emptyView
        : results.map(({ record }) => {
            const accessories = [] as List.Item.Accessory[];
            if (record.tags.length) {
              accessories.push({ text: record.tags.join(", ") });
            }
            if (record.validationIssues.length) {
              accessories.push({
                tag: { value: "Needs metadata", color: "red" },
              });
            }

            return (
              <List.Item
                key={record.id}
                icon={
                  record.validationIssues.length ? Icon.Warning : Icon.Document
                }
                title={record.frontMatter?.title ?? record.relativePath}
                subtitle={record.frontMatter?.description}
                accessories={accessories}
                detail={
                  <List.Item.Detail
                    markdown={`**Path:** ${record.relativePath}\n\n${record.excerpt || "(empty file)"}`}
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Last Modified"
                          text={record.modifiedAt.toLocaleString()}
                        />
                        {record.tags.length ? (
                          <List.Item.Detail.Metadata.TagList title="Tags">
                            {record.tags.map((tag) => (
                              <List.Item.Detail.Metadata.TagList.Item
                                key={tag}
                                text={tag}
                              />
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
                            text={
                              issue.path
                                ? `${issue.message} (${issue.path})`
                                : issue.message
                            }
                          />
                        ))}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Open title="Open Prompt" target={record.filePath} />
                    <Action.ShowInFinder
                      title="Reveal in Finder"
                      path={record.filePath}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
    </List>
  );
}
