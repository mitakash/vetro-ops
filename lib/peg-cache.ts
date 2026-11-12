import { FRESH_MS, isUsableSnapshot, snapshotAgeMs } from "./peg-freshness.ts";

export type SnapshotRecord = {
  fetchedAt: string;
  ok: boolean;
  rows: unknown[];
  error: string | null;
};

export type SnapshotResult<T> =
  | { state: "ready"; snapshot: T; fromCache: boolean }
  | { state: "pending" }
  | { state: "error"; error: string };

type LoadResult<T> = { ok: true; snapshot: T } | { ok: false; error: string };

type GateSlot<T> = {
  memory: T | null;
  inflight: Promise<LoadResult<T>> | null;
};

function sharedSlot<T>(key: string): GateSlot<T> {
  const root = globalThis as { __vetroPegSlots?: Map<string, GateSlot<unknown>> };
  if (!root.__vetroPegSlots) root.__vetroPegSlots = new Map();
  const existing = root.__vetroPegSlots.get(key) as GateSlot<T> | undefined;
  if (existing) return existing;
  const created: GateSlot<T> = { memory: null, inflight: null };
  root.__vetroPegSlots.set(key, created);
  return created;
}

/**
 * Last-good snapshot with a single in-flight refresh.
 * A failed load leaves the previous snapshot in place.
 */
export function createSnapshotGate<T extends SnapshotRecord>(options: {
  load: () => Promise<T>;
  read: () => Promise<T | null>;
  write: (snapshot: T) => Promise<void>;
  /** Share the in-flight read across bundled copies of this module in one process. */
  stateKey?: string;
  now?: () => number;
  freshMs?: number;
  coldStartMs?: number;
  schedule?: (task: () => Promise<void>) => void;
  errorText?: (error: unknown) => string;
}) {
  const now = options.now ?? (() => Date.now());
  const coldStartMs = options.coldStartMs ?? 20_000;
  const freshMs = options.freshMs ?? FRESH_MS;
  const errorText = options.errorText ?? ((error: unknown) => (error instanceof Error ? error.message : "Request failed"));
  const slot: GateSlot<T> = options.stateKey ? sharedSlot<T>(options.stateKey) : { memory: null, inflight: null };

  function beginLoad(): Promise<LoadResult<T>> {
    if (slot.inflight) return slot.inflight;
    const run = (async (): Promise<LoadResult<T>> => {
      try {
        const loaded = await options.load();
        if (!isUsableSnapshot(loaded)) {
          return { ok: false, error: loaded.error ?? "Peg monitor could not be read" };
        }
        slot.memory = loaded;
        try {
          await options.write(loaded);
        } catch {
          // The isolate still has the snapshot. The next read can persist it again.
        }
        return { ok: true, snapshot: loaded };
      } catch (error) {
        return { ok: false, error: errorText(error) };
      }
    })();
    slot.inflight = run.finally(() => {
      slot.inflight = null;
    });
    return slot.inflight;
  }

  function keepAlive(job: Promise<LoadResult<T>>) {
    options.schedule?.(() => job.then(() => undefined));
  }

  async function remember(): Promise<T | null> {
    if (slot.memory && isUsableSnapshot(slot.memory)) return slot.memory;
    try {
      const stored = await options.read();
      if (stored && isUsableSnapshot(stored)) {
        slot.memory = stored;
        return stored;
      }
    } catch {
      // A missing persistent snapshot is a cold start, not a failed price read.
    }
    return null;
  }

  return {
    async get(mode: "cached" | "fresh" = "cached"): Promise<SnapshotResult<T>> {
      if (mode === "fresh") {
        const result = await beginLoad();
        if (result.ok) return { state: "ready", snapshot: result.snapshot, fromCache: false };
        return { state: "error", error: result.error };
      }

      const saved = await remember();
      if (saved) {
        if (snapshotAgeMs(saved.fetchedAt, now()) > freshMs) {
          keepAlive(beginLoad());
        }
        return { state: "ready", snapshot: saved, fromCache: true };
      }

      const job = beginLoad();
      keepAlive(job);
      const result = await Promise.race([
        job,
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), coldStartMs);
        }),
      ]);
      if (result === null) return { state: "pending" };
      if (result.ok) return { state: "ready", snapshot: result.snapshot, fromCache: false };
      const fallback = await remember();
      if (fallback) return { state: "ready", snapshot: fallback, fromCache: true };
      return { state: "error", error: result.error };
    },
  };
}
