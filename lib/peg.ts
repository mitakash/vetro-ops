import { createHash } from "node:crypto";
import { after, connection } from "next/server";
import { ethRpcUrls, hemiRpcUrls } from "@/lib/chain";
import { createSnapshotGate } from "@/lib/peg-cache";
import { isSnapshotStale } from "@/lib/peg-freshness";
import { readStoredSnapshot, writeStoredSnapshot } from "@/lib/peg-store";
import { publicError } from "@/lib/errors";
import { loadPegMonitor } from "@/lib/peg-load";
import type { PegAsset } from "@/lib/peg-math";
import type { PegMonitor } from "@/lib/peg-types";

const PEGS: PegAsset[] = ["VUSD", "sVUSD", "vetBTC", "svetBTC"];

type Loaded = Omit<PegMonitor, "cached" | "stale" | "pending">;

function fingerprint(urls: string[]): string {
  return createHash("sha256").update(urls.join("|")).digest("hex").slice(0, 12);
}

function rpcFingerprint(): string {
  return `${fingerprint(ethRpcUrls())}:${fingerprint(hemiRpcUrls())}`;
}

function blankMonitor(overrides: Pick<PegMonitor, "ok" | "pending" | "error">): PegMonitor {
  return {
    ok: overrides.ok,
    fetchedAt: new Date().toISOString(),
    cached: false,
    stale: false,
    pending: overrides.pending,
    ethereumProvider: null,
    gatewayLogs: null,
    ethereumBlock: null,
    hemiBlock: null,
    fair: { svusdNav: null, svetbtcNav: null, btcUsd: null, ethUsd: null },
    worst: Object.fromEntries(PEGS.map((peg) => [peg, { bps: null, venue: null }])) as PegMonitor["worst"],
    alert: { active: false, thresholdBps: 50, reasons: overrides.error ? ["Peg monitor could not be read"] : [] },
    rows: [],
    error: overrides.error,
  };
}

function present(snapshot: Loaded, fromCache: boolean): PegMonitor {
  const now = Date.now();
  return {
    ...snapshot,
    cached: fromCache,
    stale: isSnapshotStale(snapshot.fetchedAt, now),
    pending: false,
  };
}

const snapshotKey = rpcFingerprint();

const gate = createSnapshotGate<Loaded>({
  stateKey: snapshotKey,
  load: loadPegMonitor,
  read: () => readStoredSnapshot(snapshotKey),
  write: (snapshot) => writeStoredSnapshot(snapshotKey, present(snapshot, true)),
  schedule: (task) => {
    try {
      after(task);
    } catch {
      void task();
    }
  },
  errorText: publicError,
});

/**
 * Return the last good snapshot immediately when one exists, and refresh it in
 * the background. A cold start waits at most 20 seconds, then asks the visitor
 * to reload. A failed refresh never replaces a good snapshot.
 */
export async function getPegMonitor(options?: { fresh?: boolean }): Promise<PegMonitor> {
  await connection();
  const result = await gate.get(options?.fresh ? "fresh" : "cached");
  if (result.state === "pending") {
    return blankMonitor({
      ok: false,
      pending: true,
      error: null,
    });
  }
  if (result.state === "error") {
    return blankMonitor({
      ok: false,
      pending: false,
      error: result.error,
    });
  }
  return present(result.snapshot, result.fromCache);
}

export function pegSummary(monitor: PegMonitor) {
  return {
    ok: monitor.ok && !monitor.alert.active && !monitor.pending,
    fetchedAt: monitor.fetchedAt,
    cached: monitor.cached,
    stale: monitor.stale,
    pending: monitor.pending,
    ethereumProvider: monitor.ethereumProvider,
    gatewayLogs: monitor.gatewayLogs
      ? {
          provider: monitor.gatewayLogs.provider,
          lookbackBlocks: monitor.gatewayLogs.lookbackBlocks,
          eventCount: monitor.gatewayLogs.eventCount,
          error: monitor.gatewayLogs.error,
        }
      : null,
    ethereumBlock: monitor.ethereumBlock,
    hemiBlock: monitor.hemiBlock,
    fair: monitor.fair,
    worst: monitor.worst,
    alert: monitor.alert,
    pools: monitor.rows.map((row) => ({
      id: row.id,
      peg: row.peg,
      chain: row.chain,
      venue: row.venue,
      pair: row.pair,
      verified: row.verified,
      ok: row.ok,
      poolPrice: row.poolPrice,
      fairValue: row.fairValue,
      premiumBps: row.premiumBps,
      direction: row.direction,
      tradeAmount: row.tradeAmount,
      tradeSymbol: row.tradeSymbol,
      tradeUsd: row.tradeUsd,
      tradeStatus: row.tradeStatus,
      tvlUsd: row.tvlUsd,
      error: row.error,
    })),
  };
}
