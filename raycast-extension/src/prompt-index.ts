import { watch } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import Fuse from "fuse.js";
import { Cache } from "@raycast/api";
import { isPromptFile, parsePrompt } from "./prompt-parser";
import { PromptRecord } from "./prompt-types";

const cache = new Cache();
const CACHE_KEY_PREFIX = "prompt-index:";
const WATCH_DEBOUNCE_MS = 150;
const RECENCY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;

const FUSE_OPTIONS: Fuse.IFuseOptions<PromptRecord> = {
  includeScore: true,
  keys: [
    { name: "frontMatter.title", weight: 0.45 },
    { name: "frontMatter.description", weight: 0.2 },
    { name: "tags", weight: 0.15 },
    { name: "relativePath", weight: 0.1 },
    { name: "content", weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

type CachedRecord = Omit<PromptRecord, "modifiedAt"> & { modifiedAt: string };

function isHiddenOrVendored(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

async function listPromptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return isHiddenOrVendored(entry.name) ? [] : listPromptFiles(fullPath);
      }
      return entry.isFile() && isPromptFile(entry.name) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

async function loadRecord(
  filePath: string,
  root: string,
): Promise<PromptRecord | null> {
  try {
    const [raw, stats] = await Promise.all([
      readFile(filePath, "utf8"),
      stat(filePath),
    ]);
    return parsePrompt(raw, filePath, root, stats.mtime);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to load prompt", filePath, error);
    }
    return null;
  }
}

export class PromptIndex {
  private records = new Map<string, PromptRecord>();
  private sorted: PromptRecord[] = [];
  private readonly fuse = new Fuse<PromptRecord>([], FUSE_OPTIONS);
  private readonly listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private pendingPaths = new Set<string>();
  private pendingFullRescan = false;
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(private readonly root: string) {
    this.restoreFromCache();
  }

  all(): PromptRecord[] {
    return this.sorted;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(): Promise<void> {
    this.loading ??= this.rescan()
      .then(() => this.watch())
      .catch((error) => {
        this.loading = null;
        throw error;
      });
    return this.loading;
  }

  search(query: string, limit = 50): PromptRecord[] {
    const now = Date.now();
    return this.fuse
      .search(query, { limit: limit * 2 })
      .map(({ item, score = 1 }) => {
        const age = Math.max(now - item.modifiedAt.getTime(), 0);
        const recencyPenalty = Math.min(age / RECENCY_WINDOW_MS, 1) * 0.25;
        return { item, rank: score + recencyPenalty };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map(({ item }) => item);
  }

  private get cacheKey(): string {
    return `${CACHE_KEY_PREFIX}${this.root}`;
  }

  private restoreFromCache(): void {
    const cached = cache.get(this.cacheKey);
    if (!cached) {
      return;
    }
    try {
      const records = (JSON.parse(cached) as CachedRecord[]).map((record) => ({
        ...record,
        modifiedAt: new Date(record.modifiedAt),
      }));
      this.records = new Map(
        records.map((record) => [record.filePath, record]),
      );
      this.reindex();
    } catch {
      cache.remove(this.cacheKey);
    }
  }

  private async rescan(): Promise<void> {
    const files = await listPromptFiles(this.root);
    const loaded = await Promise.all(
      files.map((file) => loadRecord(file, this.root)),
    );
    this.records = new Map(
      loaded
        .filter((record): record is PromptRecord => record !== null)
        .map((record) => [record.filePath, record]),
    );
    this.commit();
  }

  private reindex(): void {
    this.sorted = [...this.records.values()].sort(
      (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
    );
    this.fuse.setCollection(this.sorted);
  }

  private commit(): void {
    this.reindex();
    try {
      cache.set(this.cacheKey, JSON.stringify(this.sorted));
    } catch (error) {
      console.warn("Failed to cache prompt index", error);
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  private watch(): void {
    try {
      const watcher = watch(this.root, { recursive: true }, (_, filename) => {
        if (!filename) {
          return;
        }
        if (filename.split(path.sep).some(isHiddenOrVendored)) {
          return;
        }
        if (isPromptFile(filename)) {
          this.pendingPaths.add(path.join(this.root, filename));
        } else if (!path.extname(filename)) {
          // Likely a directory rename/delete, which may not emit per-file events.
          this.pendingFullRescan = true;
        } else {
          return;
        }
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(
          () => void this.flushPending(),
          WATCH_DEBOUNCE_MS,
        );
      });
      watcher.on("error", (error) =>
        console.error("Prompt watcher error", error),
      );
    } catch (error) {
      console.error("Failed to watch prompts folder", error);
    }
  }

  private async flushPending(): Promise<void> {
    const paths = [...this.pendingPaths];
    const fullRescan = this.pendingFullRescan;
    this.pendingPaths.clear();
    this.pendingFullRescan = false;

    try {
      if (fullRescan) {
        await this.rescan();
        return;
      }
      const updates = await Promise.all(
        paths.map(async (filePath) => ({
          filePath,
          record: await loadRecord(filePath, this.root),
        })),
      );
      for (const { filePath, record } of updates) {
        if (record) {
          this.records.set(filePath, record);
        } else {
          this.records.delete(filePath);
        }
      }
      this.commit();
    } catch (error) {
      console.error("Failed to apply prompt changes", error);
    }
  }
}

const indices = new Map<string, PromptIndex>();

export function getPromptIndex(promptsPath: string): PromptIndex {
  const root = path.resolve(promptsPath);
  let index = indices.get(root);
  if (!index) {
    index = new PromptIndex(root);
    indices.set(root, index);
  }
  return index;
}
