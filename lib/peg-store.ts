import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import type { PegMonitor } from "./peg-types.ts";

/** Matches Next's `false` revalidate so a later read treats the entry as fresh. */
const INFINITE_REVALIDATE = 0xfffffffe;

type FetchEntry = {
  kind: "FETCH";
  data: { headers: Record<string, never>; body: string; status: number; url: string };
  revalidate: number;
};

type IncrementalCache = {
  generateSimpleCacheKey: (input: string) => Promise<string>;
  get: (
    key: string,
    ctx: { kind: "FETCH"; revalidate: number; tags: string[] },
  ) => Promise<{ value?: { kind?: string; data?: { body?: string } } } | null>;
  set: (key: string, data: FetchEntry, ctx: { fetchCache: true; tags: string[] }) => Promise<void>;
};

function cacheKeyInput(fingerprint: string): string {
  return `vetro-peg-snapshot-v4:${fingerprint}`;
}

function incrementalCache(): IncrementalCache | null {
  const cache = workAsyncStorage.getStore()?.incrementalCache as IncrementalCache | undefined;
  if (!cache?.generateSimpleCacheKey || !cache.get || !cache.set) return null;
  return cache;
}

export async function readStoredSnapshot(fingerprint: string): Promise<PegMonitor | null> {
  const cache = incrementalCache();
  if (!cache) return null;
  const key = await cache.generateSimpleCacheKey(cacheKeyInput(fingerprint));
  const entry = await cache.get(key, { kind: "FETCH", revalidate: INFINITE_REVALIDATE, tags: [] });
  const body = entry?.value?.kind === "FETCH" ? entry.value.data?.body : undefined;
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as PegMonitor;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Replace the saved snapshot. The next visit reads it instead of starting a chain round. */
export async function writeStoredSnapshot(fingerprint: string, snapshot: PegMonitor): Promise<void> {
  const cache = incrementalCache();
  if (!cache) return;
  const key = await cache.generateSimpleCacheKey(cacheKeyInput(fingerprint));
  await cache.set(
    key,
    {
      kind: "FETCH",
      data: {
        headers: {},
        body: JSON.stringify(snapshot),
        status: 200,
        url: "",
      },
      revalidate: INFINITE_REVALIDATE,
    },
    { fetchCache: true, tags: [] },
  );
}
