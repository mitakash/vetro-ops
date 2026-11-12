import { type PublicClient } from "viem";
import { getInfuraLogClient, getPublicLogClient } from "@/lib/chain";
import { GATEWAY, GATEWAY_EVENT_LIMIT, gatewayEvents } from "@/lib/contracts";
import { publicError } from "@/lib/errors";
import {
  gatewayLookbackBlocks,
  type RpcProviderName,
} from "@/lib/rpc-plan";

export type GatewayLogRead = {
  provider: RpcProviderName;
  lookbackBlocks: number;
  fromBlock: string | null;
  toBlock: string | null;
  eventCount: number;
  error: string | null;
};

const CHUNK = 2_000n;

/**
 * Gateway Deposit and Withdraw logs. Infura is tried first with its wider
 * lookback. If Infura is unset or the read fails, the public RPC is used and
 * the window stays at about 12,000 blocks.
 */
export async function readGatewayLogs(): Promise<GatewayLogRead> {
  const infura = getInfuraLogClient();
  if (infura) {
    const read = await readWith(infura, "infura");
    if (!read.error) return read;
  }
  const pub = getPublicLogClient();
  return readWith(pub, "public");
}

async function readWith(client: PublicClient, provider: RpcProviderName): Promise<GatewayLogRead> {
  const lookbackBlocks = gatewayLookbackBlocks(provider);
  try {
    const block = await client.getBlock();
    const latest = block.number;
    const span = BigInt(lookbackBlocks);
    const from = latest > span ? latest - span : 0n;
    const collected = await collect(client, from, latest, provider === "infura");
    return {
      provider,
      lookbackBlocks,
      fromBlock: collected.from.toString(),
      toBlock: latest.toString(),
      eventCount: collected.count,
      error: collected.error,
    };
  } catch (error) {
    return {
      provider,
      lookbackBlocks,
      fromBlock: null,
      toBlock: null,
      eventCount: 0,
      error: publicError(error),
    };
  }
}

async function collect(
  client: PublicClient,
  from: bigint,
  to: bigint,
  allowWide: boolean,
): Promise<{ count: number; from: bigint; error: string | null }> {
  if (allowWide) {
    try {
      const count = await countRange(client, from, to);
      return { count, from, error: null };
    } catch {
      // Fall through to 2,000-block chunks. Public nodes reject a 12k range.
    }
  }
  let count = 0;
  let cursor = to;
  let oldest = to;
  let readAny = false;
  while (cursor >= from && count < GATEWAY_EVENT_LIMIT) {
    const start = cursor - CHUNK + 1n > from ? cursor - CHUNK + 1n : from;
    try {
      count += await countRange(client, start, cursor);
      oldest = start;
      readAny = true;
    } catch (error) {
      if (readAny) return { count, from: oldest, error: null };
      return { count, from: oldest, error: publicError(error) };
    }
    if (start === from) break;
    cursor = start - 1n;
  }
  return { count, from: oldest, error: null };
}

async function countRange(client: PublicClient, fromBlock: bigint, toBlock: bigint): Promise<number> {
  const [deposits, withdraws] = await Promise.all([
    client.getLogs({
      address: GATEWAY,
      event: gatewayEvents[0],
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: GATEWAY,
      event: gatewayEvents[1],
      fromBlock,
      toBlock,
    }),
  ]);
  return deposits.length + withdraws.length;
}
