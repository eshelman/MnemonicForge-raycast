import { useCallback, useEffect, useRef, useState } from "react";
import { getPromptIndex, PromptIndex, PromptSearchResult } from "./prompt-index";
import { PromptRecord } from "./prompt-types";

export interface UsePromptIndexState {
  isLoading: boolean;
  error: string | null;
  records: PromptRecord[];
  hasIndex: boolean;
  search: (query: string, limit?: number) => PromptSearchResult[];
  refresh: () => Promise<void>;
}

export function usePromptIndex(promptsPath: string | undefined): UsePromptIndexState {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<PromptRecord[]>([]);
  const indexRef = useRef<PromptIndex | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    async function initialize() {
      if (!promptsPath) {
        setError("Set the Prompts Folder preference to your prompt_templates directory.");
        setRecords([]);
        setIsLoading(false);
        indexRef.current = null;
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const index = await getPromptIndex(promptsPath);
        if (!isMounted) {
          return;
        }

        indexRef.current = index;
        setRecords(index.getAll());

        unsubscribe = index.subscribe(() => {
          if (!isMounted) {
            return;
          }
          setRecords(index.getAll());
        });
      } catch (caught) {
        if (!isMounted) {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Failed to index prompts.";
        setError(message);
        setRecords([]);
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

  const search = useCallback(
    (query: string, limit = 50): PromptSearchResult[] => {
      if (!indexRef.current) {
        return [];
      }

      return indexRef.current.search(query, limit);
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!indexRef.current) {
      return;
    }

    setIsLoading(true);
    try {
      await indexRef.current.refresh();
      setRecords(indexRef.current.getAll());
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    records,
    hasIndex: Boolean(indexRef.current),
    search,
    refresh,
  };
}
