import { stat, readFile, readdir } from "fs/promises";
import path from "path";
import chokidar from "chokidar";
import matter from "gray-matter";
import Ajv, { ErrorObject } from "ajv";
import Fuse from "fuse.js";
import schema from "../prompt.schema.json";
import {
  PromptFrontMatter,
  PromptRecord,
  PromptValidationIssue,
} from "./prompt-types";

const VALID_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml",
]);

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFrontMatter = ajv.compile(schema);

function toTag(segment: string): string | null {
  const normalized = segment
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop();

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildExcerpt(content: string, maxLength = 260): string {
  const clean = content.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1)}…`;
}

function collectIssues(
  errors: ErrorObject[] | null | undefined,
): PromptValidationIssue[] {
  if (!errors) {
    return [];
  }

  return errors.map((error) => ({
    message: error.message ?? "Unknown schema validation error",
    path: error.instancePath || undefined,
  }));
}

async function walkDirectory(
  root: string,
  callback: (filePath: string) => Promise<void>,
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          return;
        }
        await walkDirectory(fullPath, callback);
        return;
      }

      if (!entry.isFile()) {
        return;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!VALID_EXTENSIONS.has(extension)) {
        return;
      }

      await callback(fullPath);
    }),
  );
}

function deriveTags(
  relativePath: string,
  frontMatter?: PromptFrontMatter,
): string[] {
  const segments = relativePath.split(path.sep).slice(0, -1);
  const folderTags = segments
    .map(toTag)
    .filter((tag): tag is string => Boolean(tag));

  const fmTags = frontMatter?.tags ?? [];
  const combined = [...folderTags, ...fmTags];

  const unique = new Set<string>();
  for (const tag of combined) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function buildRecord(
  filePath: string,
  relativePath: string,
  modifiedAt: Date,
  content: string,
  frontMatter?: PromptFrontMatter,
  validationIssues: PromptValidationIssue[] = [],
): PromptRecord {
  const excerpt = buildExcerpt(content);
  const tags = deriveTags(relativePath, frontMatter);

  return {
    id: relativePath,
    filePath,
    relativePath,
    tags,
    frontMatter,
    content,
    excerpt,
    modifiedAt,
    validationIssues,
  };
}

export interface PromptSearchResult {
  record: PromptRecord;
  score: number;
}

export class PromptIndex {
  private records = new Map<string, PromptRecord>();
  private fuse: Fuse<PromptRecord> | null = null;
  private watcher: chokidar.FSWatcher | null = null;
  private initialized = false;
  private listeners = new Set<() => void>();

  constructor(private readonly root: string) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.refresh();
    this.watch();
    this.initialized = true;
  }

  async refresh(): Promise<void> {
    this.records.clear();
    try {
      await walkDirectory(this.root, async (filePath) => {
        await this.ingestFile(filePath, true);
      });
    } catch (error) {
      console.error("Failed to scan prompts directory", error);
      throw error;
    }

    this.rebuildSearchIndex();
    this.emitUpdated();
  }

  async dispose(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.records.clear();
    this.fuse = null;
    this.initialized = false;
  }

  getAll(): PromptRecord[] {
    return [...this.records.values()].sort(
      (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  search(query: string, limit = 50): PromptSearchResult[] {
    if (!query.trim()) {
      return this.getAll()
        .slice(0, limit)
        .map((record, index) => ({ record, score: index }));
    }

    if (!this.fuse) {
      return [];
    }

    const fuseResults = this.fuse.search(query, { limit: limit * 2 });
    const now = Date.now();
    const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;

    return fuseResults
      .map(({ item, score }) => {
        const rawScore = typeof score === "number" ? score : 1;
        const age = now - item.modifiedAt.getTime();
        const recencyPenalty = Math.min(Math.max(age, 0) / thirtyDaysMs, 1);
        const combinedScore = rawScore + recencyPenalty * 0.25;
        return { record: item, score: combinedScore };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  }

  private rebuildSearchIndex(): void {
    const records = [...this.records.values()];
    this.fuse = new Fuse(records, {
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
    });
  }

  private emitUpdated(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("PromptIndex listener error", error);
      }
    }
  }

  private async ingestFile(
    filePath: string,
    silenceUpdate = false,
  ): Promise<void> {
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      if (!VALID_EXTENSIONS.has(extension)) {
        return;
      }

      const raw = await readFile(filePath, "utf8");
      const parsed = matter(raw);
      const relativePath = path.relative(this.root, filePath);

      let frontMatter: PromptFrontMatter | undefined;
      let validationIssues: PromptValidationIssue[] = [];

      const hasFrontMatter = Object.keys(parsed.data ?? {}).length > 0;
      if (hasFrontMatter) {
        const valid = validateFrontMatter(parsed.data);
        if (valid) {
          frontMatter = parsed.data as PromptFrontMatter;
        } else {
          validationIssues = collectIssues(validateFrontMatter.errors);
        }
      } else {
        validationIssues = [
          {
            message: "Missing front matter metadata",
          },
        ];
      }

      const record = buildRecord(
        filePath,
        relativePath,
        fileStats.mtime,
        parsed.content,
        frontMatter,
        validationIssues,
      );

      this.records.set(filePath, record);
      if (!silenceUpdate) {
        this.emitUpdated();
      }
    } catch (error) {
      console.error("Failed to ingest prompt file", filePath, error);
    }
  }

  private removeFile(filePath: string): void {
    if (this.records.delete(filePath)) {
      this.rebuildSearchIndex();
      this.emitUpdated();
    }
  }

  private watch(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    const handleChange = async (filePath: string) => {
      await this.ingestFile(filePath, true);
      this.rebuildSearchIndex();
      this.emitUpdated();
    };

    this.watcher
      .on("add", handleChange)
      .on("change", handleChange)
      .on("unlink", (filePath) => this.removeFile(filePath))
      .on("error", (error) => console.error("Prompt watcher error", error));
  }
}

const indices = new Map<string, PromptIndex>();

export async function getPromptIndex(
  promptsPath: string,
): Promise<PromptIndex> {
  const normalizedRoot = path.resolve(promptsPath);
  let index = indices.get(normalizedRoot);

  if (!index) {
    index = new PromptIndex(normalizedRoot);
    indices.set(normalizedRoot, index);
  }

  await index.initialize();
  return index;
}

export async function disposePromptIndex(promptsPath: string): Promise<void> {
  const normalizedRoot = path.resolve(promptsPath);
  const index = indices.get(normalizedRoot);
  if (index) {
    await index.dispose();
    indices.delete(normalizedRoot);
  }
}
