import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { ethRpcUrls, hemiRpcUrls } from "@/lib/chain";
import { publicError } from "@/lib/errors";
import { loadPegMonitor } from "@/lib/peg-load";
import type { PegAsset } from "@/lib/peg-math";
import type { PegMonitor } from "@/lib/peg-types";

const PEGS: PegAsset[] = ["VUSD", "sVUSD", "vetBTC", "svetBTC"];

function fingerprint(urls: string[]): string {
  return createHash("sha256").update(urls.join("|")).digest("hex").slice(0, 12);
}

export async function getPegMonitor(options?: { fresh?: boolean }): Promise<PegMonitor> {
  await connection();
  const key = ["vetro-peg-v1", fingerprint(ethRpcUrls()), fingerprint(hemiRpcUrls())];
  try {
    if (options?.fresh) {
      const data = await loadPegMonitor();
      return { ...data, cached: false };
    }
    const data = await unstable_cache(loadPegMonitor, key, { revalidate: 60 })();
    return { ...data, cached: true };
  } catch (error) {
    return {
      ok: false,
      fetchedAt: new Date().toISOString(),
      cached: false,
      ethereumProvider: null,
      gatewayLogs: null,
      ethereumBlock: null,
      hemiBlock: null,
      fair: { svusdNav: null, svetbtcNav: null, btcUsd: null, ethUsd: null },
      worst: Object.fromEntries(PEGS.map((peg) => [peg, { bps: null, venue: null }])) as PegMonitor["worst"],
      alert: { active: true, thresholdBps: 50, reasons: ["Peg monitor could not be read"] },
      rows: [],
      error: publicError(error),
    };
  }
}

export function pegSummary(monitor: PegMonitor) {
  return {
    ok: monitor.ok && !monitor.alert.active,
    fetchedAt: monitor.fetchedAt,
    cached: monitor.cached,
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
