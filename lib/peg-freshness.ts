/** Serve a saved snapshot without a chain read when it is younger than this. */
export const FRESH_MS = 60_000;
/** Show the background-refresh note after this age. Also the API `stale` flag. */
export const STALE_MS = 5 * 60_000;
/** Show the amber stale badge after this age. */
export const VERY_STALE_MS = 30 * 60_000;
/** Cold start: stop blocking the response and show the loading state. */
export const COLD_START_MS = 20_000;

export function snapshotAgeMs(fetchedAt: string, now: number): number {
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - then);
}

export function isSnapshotStale(fetchedAt: string, now: number): boolean {
  return snapshotAgeMs(fetchedAt, now) > STALE_MS;
}

export function isSnapshotVeryStale(fetchedAt: string, now: number): boolean {
  return snapshotAgeMs(fetchedAt, now) > VERY_STALE_MS;
}

export function needsBackgroundRefresh(fetchedAt: string, now: number): boolean {
  return snapshotAgeMs(fetchedAt, now) > FRESH_MS;
}

/** A failed or empty read must not replace a snapshot that still has prices. */
export function isUsableSnapshot(data: { ok: boolean; rows: unknown[]; error: string | null }): boolean {
  return data.ok && data.rows.length > 0 && data.error === null;
}

/**
 * Clock time in America/New_York, labeled ET, plus a minute age.
 * Example: "Data as of 7:02 AM ET (3 min ago)".
 */
export function formatDataAsOf(fetchedAt: string, now: number): string {
  const then = new Date(fetchedAt);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(then);
  const minutes = Math.floor(snapshotAgeMs(fetchedAt, now) / 60_000);
  const ago = `${minutes} min ago`;
  return `Data as of ${time} ET (${ago})`;
}
