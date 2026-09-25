import { useCallback, useEffect, useMemo, useState } from "react";
import { getPromptIndex } from "./prompt-index";
import { PromptRecord } from "./prompt-types";

export function usePromptIndex(promptsPath: string) {
  const index = useMemo(() => getPromptIndex(promptsPath), [promptsPath]);
  const [records, setRecords] = useState<PromptRecord[]>(() => index.all());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRecords(index.all());
    const unsubscribe = index.subscribe(() => setRecords(index.all()));

    index
      .load()
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Failed to index prompts.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [index]);

  const search = useCallback((query: string) => index.search(query), [index]);

  return { isLoading, error, records, search };
}
