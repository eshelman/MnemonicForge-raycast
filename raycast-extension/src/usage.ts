import { PromptRecord } from "./prompt-types";

export interface UsageEntry {
  count: number;
  lastUsed: number;
}

export type UsageStats = Record<string, UsageEntry>;

const DAY_MS = 1000 * 60 * 60 * 24;
const HALF_LIFE_DAYS = 14;
const MAX_SEARCH_BOOST = 0.2;

export function recordUse(
  stats: UsageStats,
  id: string,
  now: number,
): UsageStats {
  const previous = stats[id];
  return {
    ...stats,
    [id]: { count: (previous?.count ?? 0) + 1, lastUsed: now },
  };
}

/** Use count decayed by time since last use; halves every HALF_LIFE_DAYS. */
export function frecency(entry: UsageEntry | undefined, now: number): number {
  if (!entry) {
    return 0;
  }
  const ageDays = Math.max(now - entry.lastUsed, 0) / DAY_MS;
  return entry.count * 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

function byTitle(a: PromptRecord, b: PromptRecord): number {
  const titleA = a.frontMatter?.title ?? a.relativePath;
  const titleB = b.frontMatter?.title ?? b.relativePath;
  return titleA.localeCompare(titleB);
}

/** Frequently/recently used prompts first, the rest alphabetically. */
export function rankForBrowse(
  records: PromptRecord[],
  stats: UsageStats,
  now: number,
): PromptRecord[] {
  return records
    .map((record) => ({ record, score: frecency(stats[record.id], now) }))
    .sort((a, b) => b.score - a.score || byTitle(a.record, b.record))
    .map(({ record }) => record);
}

/**
 * Fuse scores run from 0 (exact) upward; usage subtracts up to MAX_SEARCH_BOOST
 * so a habitually used prompt can edge out a slightly better text match.
 */
export function rankSearchResults(
  results: Array<{ record: PromptRecord; score: number }>,
  stats: UsageStats,
  now: number,
): PromptRecord[] {
  return results
    .map(({ record, score }) => {
      const usage = frecency(stats[record.id], now);
      return { record, rank: score - MAX_SEARCH_BOOST * (usage / (usage + 2)) };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ record }) => record);
}
