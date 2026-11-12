import {
  erc20Abi,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";
import { ethereumProviderInUse, getHemiClient, getPublicClient, pegAlertBps, resetEthereumProvider } from "@/lib/chain";
import { coingeckoUsdWad } from "@/lib/coingecko";
import {
  counterpartyTone,
  excludeCounterpartyFromHeadline,
  impliedUsdPerTokenWad,
} from "@/lib/counterparty";
import { readGatewayLogs } from "@/lib/gateway-logs";
import {
  brownFiStateAbi,
  brownFiTickAbi,
  CHAINLINK_BTC_USD,
  CHAINLINK_ETH_USD,
  chainlinkAbi,
  curveCryptoAbi,
  erc4626Abi,
  stableSwapNgAbi,
  SVETBTC,
  SVUSD,
  tokenMeta,
  v3PoolAbi,
  v3TickAbi,
} from "@/lib/contracts";
import { publicError } from "@/lib/errors";
import {
  approximateTick,
  bitmapWord,
  chainlinkAnswerToWad,
  counterPerVetroWad,
  fairCounterPerVetroWad,
  isBtcWrapper,
  counterPerVetroExecutionWad,
  quoteToSqrtPrice,
  stableMarginalWad,
  targetSqrtPrice,
  tradeStableToFair,
  usdNotionalWad,
  usdPerTokenWad,
  type ClPool,
  type PegAsset,
  type StablePoolState,
} from "@/lib/peg-math";
import type { ClSim, CurveSim, PegBlock, PegMonitor, PegRow, WorstDiscount } from "@/lib/peg-types";
import {
  deviationBps,
  exchangeWad,
  formatAmount,
  formatPegPrice,
  formatUsdWad,
  invertWad,
} from "@/lib/quote-math";
import { buildTradeUrl, explorerUrl } from "@/lib/venue-links";
import { VENUES, type Venue, type VenueChain } from "@/lib/venues";

const STALE_ORACLE_SECONDS = 36 * 60 * 60;
const PEGS: PegAsset[] = ["VUSD", "sVUSD", "vetBTC", "svetBTC"];

type RpcCall = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

type References = {
  svusdNav: bigint | null;
  svetbtcNav: bigint | null;
  btcUsdWad: bigint | null;
  ethUsdWad: bigint | null;
};

type StableDraft = {
  venue: Venue;
  coin: [number, number];
  balance: [number, number];
  amp: number;
  fee: number;
  offpeg: number;
  rates: number;
};

type CryptoDraft = {
  venue: Venue;
  coin: [number, number];
  balance: [number, number];
};

type ClDraft = {
  venue: Venue;
  token0: number;
  token1: number;
  sqrt: number;
  liquidity: number;
  fee: number | null;
  spacing: number | null;
  wallet: [number, number];
};

export async function loadPegMonitor(): Promise<Omit<PegMonitor, "cached" | "stale" | "pending">> {
  const fetchedAt = new Date().toISOString();
  let threshold = 50;
  try {
    threshold = pegAlertBps();
  } catch {
    threshold = 50;
  }
  resetEthereumProvider();
  const [ethereum, hemi, gatewayLogs, quotes] = await Promise.all([
    loadChain(getPublicClient(), "ethereum"),
    loadChain(getHemiClient(), "hemi"),
    readGatewayLogs(),
    loadCounterpartyQuotes(),
  ]);
  const references = ethereum.references;
  const rows = [
    ...ethereum.rows.map((row) => finishRow(row, references, quotes)),
    ...hemi.rows.map((row) => finishRow(row, references, quotes)),
  ];
  const worst = worstDiscounts(rows);
  const reasons = alertReasons(rows, threshold);
  const chainFailed = ethereum.error && hemi.error;
  return {
    ok: !chainFailed && rows.some((row) => row.ok),
    fetchedAt,
    ethereumProvider: ethereumProviderInUse(),
    gatewayLogs,
    ethereumBlock: ethereum.block,
    hemiBlock: hemi.block,
    fair: {
      svusdNav: references.svusdNav ? formatPegPrice(references.svusdNav) : null,
      svetbtcNav: references.svetbtcNav ? formatPegPrice(references.svetbtcNav) : null,
      btcUsd: references.btcUsdWad ? formatUsdWad(references.btcUsdWad) : null,
      ethUsd: references.ethUsdWad ? formatUsdWad(references.ethUsdWad) : null,
    },
    worst,
    alert: { active: reasons.length > 0, thresholdBps: threshold, reasons },
    rows,
    error: chainFailed ? ethereum.error : null,
  };
}

type ChainLoad = {
  block: PegBlock | null;
  references: References;
  rows: DraftRow[];
  error: string | null;
};

type DraftRow =
  | { kind: "stable"; venue: Venue; state: StablePoolState; coins: [Address, Address]; verified: boolean }
  | { kind: "crypto"; venue: Venue; coins: [Address, Address]; balances: [bigint, bigint]; spot: bigint | null; verified: boolean }
  | {
      kind: "cl";
      venue: Venue;
      token0: Address;
      token1: Address;
      sqrtPriceX96: bigint;
      tick: number;
      liquidity: bigint;
      feePips: number;
      tickSpacing: number;
      bitmap: Map<number, bigint>;
      liquidityNet: Map<number, bigint>;
      wallets: [bigint, bigint];
      verified: boolean;
    }
  | { kind: "error"; venue: Venue; verified: boolean; error: string };

async function loadChain(client: PublicClient, chain: VenueChain): Promise<ChainLoad> {
  const venues = VENUES.filter((venue) => venue.chain === chain);
  const emptyRefs: References = { svusdNav: null, svetbtcNav: null, btcUsdWad: null, ethUsdWad: null };
  try {
    const blockPromise = client.getBlock();
    const phase1 = new CallList();
    const refs = chain === "ethereum" ? referenceCalls(phase1) : null;
    const drafts = venues.map((venue) => draftCalls(phase1, venue));
    const [block, values] = await Promise.all([blockPromise, phase1.read(client)]);
    const references = refs ? readReferences(values, refs, block.timestamp) : emptyRefs;
    const prepared = venues.map((venue, index) => prepareDraft(venue, drafts[index], values));
    await enrich(client, prepared, references);
    return {
      block: {
        number: block.number.toString(),
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      },
      references,
      rows: prepared,
      error: null,
    };
  } catch (error) {
    return {
      block: null,
      references: emptyRefs,
      rows: venues.map((venue) => ({
        kind: "error",
        venue,
        verified: false,
        error: publicError(error),
      })),
      error: publicError(error),
    };
  }
}

class CallList {
  readonly calls: RpcCall[] = [];

  add(call: RpcCall): number {
    this.calls.push(call);
    return this.calls.length - 1;
  }

  async read(client: PublicClient): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let offset = 0; offset < this.calls.length; offset += 80) {
      const slice = this.calls.slice(offset, offset + 80);
      const results = await client.multicall({ allowFailure: true, contracts: slice as never });
      for (const row of results as { status: string; result?: unknown }[]) {
        out.push(row.status === "success" ? (row.result ?? null) : null);
      }
    }
    return out;
  }
}

function referenceCalls(calls: CallList) {
  return {
    svusd: calls.add({
      address: SVUSD,
      abi: erc4626Abi,
      functionName: "convertToAssets",
      args: [10n ** 18n],
    }),
    svet: calls.add({
      address: SVETBTC,
      abi: erc4626Abi,
      functionName: "convertToAssets",
      args: [10n ** 18n],
    }),
    btc: calls.add({
      address: CHAINLINK_BTC_USD,
      abi: chainlinkAbi,
      functionName: "latestRoundData",
    }),
    eth: calls.add({
      address: CHAINLINK_ETH_USD,
      abi: chainlinkAbi,
      functionName: "latestRoundData",
    }),
  };
}

function readReferences(
  values: unknown[],
  index: { svusd: number; svet: number; btc: number; eth: number },
  blockTimestamp: bigint,
): References {
  return {
    svusdNav: positive(asBigint(values[index.svusd])),
    svetbtcNav: positive(asBigint(values[index.svet])),
    btcUsdWad: oracleWad(values[index.btc], blockTimestamp),
    ethUsdWad: oracleWad(values[index.eth], blockTimestamp),
  };
}

function oracleWad(value: unknown, blockTimestamp: bigint): bigint | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const answer = asBigint(value[1]);
  const updatedAt = asBigint(value[3]);
  if (answer === null || answer <= 0n || updatedAt === null || updatedAt <= 0n) return null;
  const age = blockTimestamp > updatedAt ? blockTimestamp - updatedAt : 0n;
  if (age > BigInt(STALE_ORACLE_SECONDS)) return null;
  return chainlinkAnswerToWad(answer, 8);
}

function draftCalls(calls: CallList, venue: Venue): StableDraft | CryptoDraft | ClDraft {
  const pool = getAddress(venue.pool);
  if (venue.kind === "curve-stableswap") {
    return {
      venue,
      coin: [coinCall(calls, pool, stableSwapNgAbi, 0), coinCall(calls, pool, stableSwapNgAbi, 1)],
      balance: [balanceCall(calls, pool, stableSwapNgAbi, 0), balanceCall(calls, pool, stableSwapNgAbi, 1)],
      amp: calls.add({ address: pool, abi: stableSwapNgAbi, functionName: "A_precise" }),
      fee: calls.add({ address: pool, abi: stableSwapNgAbi, functionName: "fee" }),
      offpeg: calls.add({ address: pool, abi: stableSwapNgAbi, functionName: "offpeg_fee_multiplier" }),
      rates: calls.add({ address: pool, abi: stableSwapNgAbi, functionName: "stored_rates" }),
    };
  }
  if (venue.kind === "curve-crypto") {
    return {
      venue,
      coin: [coinCall(calls, pool, curveCryptoAbi, 0), coinCall(calls, pool, curveCryptoAbi, 1)],
      balance: [balanceCall(calls, pool, curveCryptoAbi, 0), balanceCall(calls, pool, curveCryptoAbi, 1)],
    };
  }
  const tickAbi = venue.kind === "algebra" ? brownFiTickAbi : v3TickAbi;
  const stateAbi = venue.kind === "algebra" ? brownFiStateAbi : v3PoolAbi;
  const stateFn = venue.kind === "algebra" ? "globalState" : "slot0";
  return {
    venue,
    token0: calls.add({ address: pool, abi: v3PoolAbi, functionName: "token0" }),
    token1: calls.add({ address: pool, abi: v3PoolAbi, functionName: "token1" }),
    sqrt: calls.add({ address: pool, abi: stateAbi, functionName: stateFn }),
    liquidity: calls.add({ address: pool, abi: tickAbi, functionName: "liquidity" }),
    fee: venue.kind === "v3" ? calls.add({ address: pool, abi: v3TickAbi, functionName: "fee" }) : null,
    spacing: calls.add({ address: pool, abi: tickAbi, functionName: "tickSpacing" }),
    wallet: [
      calls.add({
        address: getAddress(venue.base),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [pool],
      }),
      calls.add({
        address: getAddress(venue.quote),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [pool],
      }),
    ],
  };
}

/** One whole token, or 1% of balance on a thinner side. Dust quotes round to zero on crypto pools. */
function cryptoProbeDx(balance: bigint, decimals: number): bigint {
  if (balance <= 1n) return 1n;
  const one = 10n ** BigInt(decimals);
  const cap = balance / 100n;
  const dx = cap > 0n && cap < one ? cap : one;
  if (dx >= balance) return balance / 2n > 0n ? balance / 2n : 1n;
  return dx;
}

function coinCall(calls: CallList, pool: Address, abi: readonly unknown[], index: number): number {
  return calls.add({ address: pool, abi, functionName: "coins", args: [BigInt(index)] });
}

function balanceCall(calls: CallList, pool: Address, abi: readonly unknown[], index: number): number {
  return calls.add({ address: pool, abi, functionName: "balances", args: [BigInt(index)] });
}

function prepareDraft(venue: Venue, draft: StableDraft | CryptoDraft | ClDraft, values: unknown[]): DraftRow {
  try {
    if (venue.kind === "curve-stableswap" && "amp" in draft) return prepareStable(draft, values);
    if (venue.kind === "curve-crypto" && !("sqrt" in draft) && !("amp" in draft)) return prepareCrypto(draft, values);
    if ("sqrt" in draft) return prepareCl(draft, values);
  } catch (error) {
    return { kind: "error", venue, verified: false, error: publicError(error) };
  }
  return { kind: "error", venue, verified: false, error: "Pool kind was not read" };
}

function prepareStable(draft: StableDraft, values: unknown[]): DraftRow {
  const coins = pair(values, draft.coin);
  const balances = pairBig(values, draft.balance);
  const amp = asBigint(values[draft.amp]);
  const fee = asBigint(values[draft.fee]);
  const offpeg = asBigint(values[draft.offpeg]);
  const rates = asBigintArray(values[draft.rates]);
  if (!coins || !balances || amp === null || fee === null || !rates || rates.length < 2) {
    return { kind: "error", venue: draft.venue, verified: false, error: "StableSwap state could not be read" };
  }
  const verified = samePair(draft.venue, coins);
  return {
    kind: "stable",
    venue: draft.venue,
    coins,
    verified,
    state: {
      balances: [balances[0], balances[1]],
      rates: [rates[0], rates[1]],
      ampPrecise: amp,
      fee,
      offpegFeeMultiplier: offpeg ?? 10n ** 10n,
    },
  };
}

function prepareCrypto(draft: CryptoDraft, values: unknown[]): DraftRow {
  const coins = pair(values, draft.coin);
  const balances = pairBig(values, draft.balance);
  if (!coins || !balances) {
    return { kind: "error", venue: draft.venue, verified: false, error: "Curve crypto state could not be read" };
  }
  return {
    kind: "crypto",
    venue: draft.venue,
    coins,
    balances,
    spot: null,
    verified: samePair(draft.venue, coins),
  };
}

function prepareCl(draft: ClDraft, values: unknown[]): DraftRow {
  const token0 = asAddress(values[draft.token0]);
  const token1 = asAddress(values[draft.token1]);
  const state = asList(values[draft.sqrt]);
  const sqrtPriceX96 = state ? asBigint(state[0]) : null;
  const tick = state ? asInt(state[1]) : null;
  const liquidity = asBigint(values[draft.liquidity]);
  const spacing = draft.spacing === null ? 1 : asInt(values[draft.spacing]);
  const fee = draft.fee === null ? (state ? asInt(state[2]) : null) : asInt(values[draft.fee]);
  const wallet0 = asBigint(values[draft.wallet[0]]);
  const wallet1 = asBigint(values[draft.wallet[1]]);
  if (!token0 || !token1 || sqrtPriceX96 === null || tick === null || liquidity === null || fee === null) {
    return { kind: "error", venue: draft.venue, verified: false, error: "Pool price could not be read" };
  }
  return {
    kind: "cl",
    venue: draft.venue,
    token0,
    token1,
    sqrtPriceX96,
    tick,
    liquidity,
    feePips: fee,
    tickSpacing: draft.venue.kind === "algebra" ? 1 : Math.max(1, spacing ?? 1),
    bitmap: new Map(),
    liquidityNet: new Map(),
    wallets: [wallet0 ?? 0n, wallet1 ?? 0n],
    verified: samePair(draft.venue, [token0, token1]),
  };
}

async function enrich(client: PublicClient, rows: DraftRow[], references: References): Promise<void> {
  const second = new CallList();
  const cryptoJobs: { row: Extract<DraftRow, { kind: "crypto" }>; call: number; dx: bigint }[] = [];
  const bitmapJobs: { row: Extract<DraftRow, { kind: "cl" }>; words: { word: number; index: number }[] }[] = [];

  for (const row of rows) {
    if (row.kind === "crypto" && row.verified) {
      const side = sides(row.venue, row.coins);
      if (!side) continue;
      const dx = cryptoProbeDx(row.balances[side.vetroIndex], side.vetro.decimals);
      cryptoJobs.push({
        row,
        dx,
        call: second.add({
          address: getAddress(row.venue.pool),
          abi: curveCryptoAbi,
          functionName: "get_dy",
          args: [BigInt(side.vetroIndex), BigInt(side.counterIndex), dx],
        }),
      });
    }
    if (row.kind === "cl" && row.verified && row.sqrtPriceX96 > 0n) {
      const side = clSides(row);
      const fair = side ? fairFor(side.peg, side.counter.symbol, references) : null;
      const words = wordsFor(row, fair, side);
      bitmapJobs.push({
        row,
        words: words.map((word) => ({
          word,
          index: second.add({
            address: getAddress(row.venue.pool),
            abi: row.venue.kind === "algebra" ? brownFiTickAbi : v3TickAbi,
            functionName: row.venue.kind === "algebra" ? "tickTable" : "tickBitmap",
            args: [word],
          }),
        })),
      });
    }
  }

  const values = await second.read(client);
  for (const job of cryptoJobs) {
    const dy = asBigint(values[job.call]);
    const side = sides(job.row.venue, job.row.coins);
    if (dy === null || dy <= 0n || !side) continue;
    try {
      job.row.spot = exchangeWad(dy, job.dx, side.vetro.decimals, side.counter.decimals);
    } catch {
      job.row.spot = null;
    }
  }

  const third = new CallList();
  const tickJobs: { row: Extract<DraftRow, { kind: "cl" }>; tick: number; index: number }[] = [];
  for (const job of bitmapJobs) {
    for (const word of job.words) {
      const bitmap = asBigint(values[word.index]) ?? 0n;
      job.row.bitmap.set(word.word, bitmap);
    }
    const ticks = initializedTicks(job.row).slice(0, 80);
    for (const tick of ticks) {
      tickJobs.push({
        row: job.row,
        tick,
        index: third.add({
          address: getAddress(job.row.venue.pool),
          abi: job.row.venue.kind === "algebra" ? brownFiTickAbi : v3TickAbi,
          functionName: "ticks",
          args: [tick],
        }),
      });
    }
  }
  const tickValues = await third.read(client);
  for (const job of tickJobs) {
    const head = asList(tickValues[job.index]);
    const net = head ? asBigint(head[1]) : null;
    if (net !== null) job.row.liquidityNet.set(job.tick, net);
  }
}

function wordsFor(
  row: Extract<DraftRow, { kind: "cl" }>,
  fair: bigint | null,
  side: ReturnType<typeof clSides>,
): number[] {
  const current = bitmapWord(row.tick, row.tickSpacing);
  let target = current;
  if (fair && side) {
    try {
      const sqrt = targetSqrtPrice({
        fairWad: fair,
        decimals0: side.meta0.decimals,
        decimals1: side.meta1.decimals,
        vetroIsToken0: side.vetroIsToken0,
      });
      target = bitmapWord(approximateTick(sqrt), row.tickSpacing);
    } catch {
      target = current;
    }
  }
  let low = Math.min(current, target) - 1;
  let high = Math.max(current, target) + 1;
  if (high - low > 7) {
    if (target >= current) {
      low = current - 1;
      high = current + 6;
    } else {
      high = current + 1;
      low = current - 6;
    }
  }
  const words: number[] = [];
  for (let word = low; word <= high; word++) {
    if (word >= -32_768 && word <= 32_767) words.push(word);
  }
  return words;
}

function initializedTicks(row: Extract<DraftRow, { kind: "cl" }>): number[] {
  const ticks: number[] = [];
  for (const [word, bitmap] of row.bitmap) {
    let value = bitmap;
    let bit = 0;
    while (value > 0n && bit < 256) {
      if ((value & 1n) === 1n) ticks.push((word * 256 + bit) * row.tickSpacing);
      value >>= 1n;
      bit += 1;
    }
  }
  ticks.sort((a, b) => Math.abs(a - row.tick) - Math.abs(b - row.tick));
  return ticks;
}

function finishRow(row: DraftRow, references: References, quotes: Map<string, bigint | null>): PegRow {
  if (row.kind === "error") return errorRow(row.venue, row.verified, row.error, null, quotes);
  try {
    if (row.kind === "stable") return finishStable(row, references, quotes);
    if (row.kind === "crypto") return finishCrypto(row, references, quotes);
    return finishCl(row, references, quotes);
  } catch (error) {
    return errorRow(row.venue, row.verified, publicError(error), null, quotes);
  }
}

function finishStable(
  row: Extract<DraftRow, { kind: "stable" }>,
  references: References,
  quotes: Map<string, bigint | null>,
): PegRow {
  const side = sides(row.venue, row.coins);
  if (!side || !row.verified) {
    return errorRow(row.venue, false, "Pool coins do not match the configured pair", null, quotes);
  }
  const spot = stableMarginalWad(
    row.state,
    side.vetroIndex,
    side.counterIndex,
    side.vetro.decimals,
    side.counter.decimals,
  );
  const fair = fairFor(side.peg, side.counter.symbol, references);
  const trade = fair && spot > 0n
    ? tradeStableToFair(
        row.state,
        side.vetroIndex,
        side.counterIndex,
        side.vetro.decimals,
        side.counter.decimals,
        fair,
      )
    : null;
  const sim: CurveSim = {
    kind: "curve",
    balances: [row.state.balances[0].toString(), row.state.balances[1].toString()],
    rates: [row.state.rates[0].toString(), row.state.rates[1].toString()],
    ampPrecise: row.state.ampPrecise.toString(),
    fee: row.state.fee.toString(),
    offpegFeeMultiplier: row.state.offpegFeeMultiplier.toString(),
    decimals: [tokenMeta(row.coins[0]).decimals, tokenMeta(row.coins[1]).decimals],
    symbols: [tokenMeta(row.coins[0]).symbol, tokenMeta(row.coins[1]).symbol],
    vetroIndex: side.vetroIndex,
    counterIndex: side.counterIndex,
    fairWad: fair ? fair.toString() : null,
  };
  const built: PegRow = {
    ...baseRow(row.venue, side, row.verified, "StableSwap-NG", `fee ${Number(row.state.fee) / 1_000_000} bp`),
    ok: spot > 0n,
    poolPrice: spot > 0n ? formatPegPrice(spot) : null,
    fairValue: fair ? formatPegPrice(fair) : null,
    ...inverse(spot, fair, side),
    premiumBps: fair && spot > 0n ? deviationBps(spot, fair) : null,
    ...tradeFields(trade, side, references, fair),
    depth: depth(row.state.balances[0], row.coins[0], row.state.balances[1], row.coins[1], references),
    tvlUsd: tvl([row.state.balances[0], row.coins[0]], [row.state.balances[1], row.coins[1]], references),
    error: spot > 0n ? null : "Marginal price was zero",
    note: fair ? "Marginal price is a tiny get_dy, so the pool fee is included." : missingFairNote(side),
    sim,
  };
  return annotateCounterparty(built, row.venue, spot > 0n ? spot : null, quotes);
}

function finishCrypto(
  row: Extract<DraftRow, { kind: "crypto" }>,
  references: References,
  quotes: Map<string, bigint | null>,
): PegRow {
  const side = sides(row.venue, row.coins);
  if (!side || !row.verified) return errorRow(row.venue, false, "Pool coins do not match the configured pair", null, quotes);
  const fair = fairFor(side.peg, side.counter.symbol, references);
  const spot = row.spot;
  const built: PegRow = {
    ...baseRow(row.venue, side, true, "Curve crypto", null),
    ok: spot !== null && spot > 0n,
    poolPrice: spot ? formatPegPrice(spot) : null,
    fairValue: fair ? formatPegPrice(fair) : null,
    ...inverse(spot ?? 0n, fair, side),
    premiumBps: fair && spot ? deviationBps(spot, fair) : null,
    direction: null,
    tradeAmount: null,
    tradeSymbol: null,
    tradeUsd: null,
    averagePrice: null,
    priceImpactBps: null,
    endPremiumBps: null,
    tradeStatus: "n/a",
    depth: depth(row.balances[0], row.coins[0], row.balances[1], row.coins[1], references),
    tvlUsd: tvl([row.balances[0], row.coins[0]], [row.balances[1], row.coins[1]], references),
    error: spot ? null : "Crypto quote could not be read",
    note: "Price is a small get_dy and includes the fee. Trade size is not computed for the crypto invariant.",
    sim: null,
  };
  return annotateCounterparty(built, row.venue, spot && spot > 0n ? spot : null, quotes);
}

function finishCl(
  row: Extract<DraftRow, { kind: "cl" }>,
  references: References,
  quotes: Map<string, bigint | null>,
): PegRow {
  const side = clSides(row);
  if (!side || !row.verified) return errorRow(row.venue, false, "Pool tokens do not match the configured pair", null, quotes);
  const spot = counterPerVetroWad(row.sqrtPriceX96, side.meta0.decimals, side.meta1.decimals, side.vetroIsToken0);
  const fair = fairFor(side.peg, side.counter.symbol, references);
  const model = row.venue.kind === "algebra" ? "BrownFi" : "Uniswap v3";
  const pool: ClPool = {
    sqrtPriceX96: row.sqrtPriceX96,
    tick: row.tick,
    liquidity: row.liquidity,
    feePips: row.feePips,
    tickSpacing: row.tickSpacing,
    bitmap: row.bitmap,
    liquidityNet: row.liquidityNet,
  };
  let tradeStatus: PegRow["tradeStatus"] = "n/a";
  let direction: PegRow["direction"] = null;
  let tradeAmount: string | null = null;
  let tradeSymbol: string | null = null;
  let tradeUsd: string | null = null;
  let averagePrice: string | null = null;
  let priceImpactBps: number | null = null;
  let endPremiumBps: number | null = null;
  let note = fair
    ? "Price is the mid from sqrt price. Trade size walks initialized ticks and includes the swap fee."
    : missingFairNote(side);
  if (row.liquidity === 0n) {
    note = "No active liquidity in the current tick, so the pool cannot be traded back to fair value.";
    tradeStatus = "n/a";
  } else if (fair && spot > 0n && Math.abs(deviationBps(spot, fair)) <= 1) {
    tradeStatus = "at-fair";
  } else if (fair && spot > 0n) {
    const limit = targetSqrtPrice({
      fairWad: fair,
      decimals0: side.meta0.decimals,
      decimals1: side.meta1.decimals,
      vetroIsToken0: side.vetroIsToken0,
    });
    const quote = quoteToSqrtPrice(pool, limit);
    const selling = quote.zeroForOne === side.vetroIsToken0;
    direction = selling ? "sell" : "buy";
    const inputSymbol = selling ? side.vetro.symbol : side.counter.symbol;
    const inputDecimals = selling ? side.vetro.decimals : side.counter.decimals;
    tradeAmount = formatAmount(quote.amountIn, inputDecimals);
    tradeSymbol = inputSymbol;
    tradeUsd = formatUsdWad(usdNotionalWad(quote.amountIn, inputDecimals, usdFor(inputSymbol, references) ?? 0n));
    if ((usdFor(inputSymbol, references) ?? 0n) === 0n) tradeUsd = null;
    if (quote.amountOut > 0n && quote.amountIn > 0n) {
      const average = counterPerVetroExecutionWad({
        counterAmount: selling ? quote.amountOut : quote.amountIn,
        vetroAmount: selling ? quote.amountIn : quote.amountOut,
        vetroDecimals: side.vetro.decimals,
        counterDecimals: side.counter.decimals,
      });
      averagePrice = formatPegPrice(average);
      priceImpactBps = deviationBps(average, spot);
    }
    const end = counterPerVetroWad(quote.sqrtPriceX96, side.meta0.decimals, side.meta1.decimals, side.vetroIsToken0);
    endPremiumBps = end > 0n ? deviationBps(end, fair) : null;
    tradeStatus = quote.insufficient ? "insufficient" : "ok";
    if (quote.amountIn === 0n && quote.insufficient) {
      tradeAmount = null;
      tradeSymbol = null;
      tradeUsd = null;
    }
  }
  const sim: ClSim = {
    kind: "cl",
    sqrtPriceX96: row.sqrtPriceX96.toString(),
    tick: row.tick,
    liquidity: row.liquidity.toString(),
    feePips: row.feePips,
    tickSpacing: row.tickSpacing,
    decimals0: side.meta0.decimals,
    decimals1: side.meta1.decimals,
    symbol0: side.meta0.symbol,
    symbol1: side.meta1.symbol,
    vetroIsToken0: side.vetroIsToken0,
    fairWad: fair ? fair.toString() : null,
    bitmap: [...row.bitmap.entries()].map(([word, value]) => ({ word, value: value.toString() })),
    ticks: [...row.liquidityNet.entries()].map(([tick, liquidityNet]) => ({
      tick,
      liquidityNet: liquidityNet.toString(),
    })),
  };
  const base = getAddress(row.venue.base);
  const quote = getAddress(row.venue.quote);
  const built: PegRow = {
    ...baseRow(row.venue, side, true, model, `fee ${row.feePips / 100} bp`),
    ok: spot > 0n,
    poolPrice: spot > 0n ? formatPegPrice(spot) : null,
    fairValue: fair ? formatPegPrice(fair) : null,
    ...inverse(spot, fair, side),
    premiumBps: fair && spot > 0n ? deviationBps(spot, fair) : null,
    direction,
    tradeAmount,
    tradeSymbol,
    tradeUsd,
    averagePrice,
    priceImpactBps,
    endPremiumBps,
    tradeStatus,
    depth: depth(row.wallets[0], base, row.wallets[1], quote, references),
    tvlUsd: tvl([row.wallets[0], base], [row.wallets[1], quote], references),
    error: null,
    note,
    sim,
  };
  return annotateCounterparty(built, row.venue, spot > 0n ? spot : null, quotes);
}

type Side = {
  peg: PegAsset;
  vetro: { address: Address; symbol: string; decimals: number };
  counter: { address: Address; symbol: string; decimals: number };
  vetroIndex: 0 | 1;
  counterIndex: 0 | 1;
};

function sides(venue: Venue, coins: [Address, Address]): Side | null {
  const metas = [0, 1].map((index) => ({ address: coins[index], ...tokenMeta(coins[index]) }));
  const peg = pegOf(metas[0].symbol, metas[1].symbol);
  const vetroIndex = metas[0].symbol === peg ? 0 : metas[1].symbol === peg ? 1 : null;
  if (vetroIndex === null) return null;
  const counterIndex = vetroIndex === 0 ? 1 : 0;
  const configured = new Set([getAddress(venue.base).toLowerCase(), getAddress(venue.quote).toLowerCase()]);
  if (!configured.has(coins[0].toLowerCase()) || !configured.has(coins[1].toLowerCase())) return null;
  return {
    peg,
    vetro: metas[vetroIndex],
    counter: metas[counterIndex],
    vetroIndex,
    counterIndex,
  };
}

function clSides(row: Extract<DraftRow, { kind: "cl" }>): (Side & {
  meta0: { symbol: string; decimals: number };
  meta1: { symbol: string; decimals: number };
  vetroIsToken0: boolean;
}) | null {
  const side = sides(row.venue, [row.token0, row.token1]);
  if (!side) return null;
  return {
    ...side,
    meta0: tokenMeta(row.token0),
    meta1: tokenMeta(row.token1),
    vetroIsToken0: side.vetroIndex === 0,
  };
}

function pegOf(a: string, b: string): PegAsset {
  if (a === "svetBTC" || b === "svetBTC") return "svetBTC";
  if (a === "sVUSD" || b === "sVUSD") return "sVUSD";
  if (a === "vetBTC" || b === "vetBTC") return "vetBTC";
  return "VUSD";
}

function fairFor(peg: PegAsset, counterSymbol: string, references: References): bigint | null {
  return fairCounterPerVetroWad({
    peg,
    counterSymbol,
    svusdNav: references.svusdNav,
    svetbtcNav: references.svetbtcNav,
    btcUsdWad: references.btcUsdWad,
    ethUsdWad: references.ethUsdWad,
  });
}

function usdFor(symbol: string, references: References): bigint | null {
  return usdPerTokenWad({
    symbol,
    svusdNav: references.svusdNav,
    svetbtcNav: references.svetbtcNav,
    btcUsdWad: references.btcUsdWad,
    ethUsdWad: references.ethUsdWad,
  });
}

function missingFairNote(side: Side): string {
  if (side.counter.symbol === "HEMI") return "No reference price for HEMI, so fair value and trade size are blank.";
  return "No reference price for this pair, so fair value and trade size are blank.";
}

function inverse(spot: bigint, fair: bigint | null, side: Side) {
  const show = isBtcWrapper(side.counter.symbol) || side.counter.symbol === "WETH";
  if (!show || spot <= 0n) {
    return { inversePrice: null, inverseFair: null, inverseUnit: null };
  }
  return {
    inversePrice: `${formatPegPrice(invertWad(spot))} ${side.vetro.symbol}`,
    inverseFair: fair ? `${formatPegPrice(invertWad(fair))} ${side.vetro.symbol}` : null,
    inverseUnit: `per ${side.counter.symbol}`,
  };
}

function tradeFields(
  trade: ReturnType<typeof tradeStableToFair> | null,
  side: Side,
  references: References,
  fair: bigint | null,
): Pick<
  PegRow,
  | "direction"
  | "tradeAmount"
  | "tradeSymbol"
  | "tradeUsd"
  | "averagePrice"
  | "priceImpactBps"
  | "endPremiumBps"
  | "tradeStatus"
> {
  if (!fair || !trade) {
    return {
      direction: null,
      tradeAmount: null,
      tradeSymbol: null,
      tradeUsd: null,
      averagePrice: null,
      priceImpactBps: null,
      endPremiumBps: null,
      tradeStatus: "n/a",
    };
  }
  if (trade.status === "at-fair") {
    return {
      direction: null,
      tradeAmount: null,
      tradeSymbol: null,
      tradeUsd: null,
      averagePrice: null,
      priceImpactBps: null,
      endPremiumBps: trade?.endPriceWad ? deviationBps(trade.endPriceWad, fair) : null,
      tradeStatus: "at-fair",
    };
  }
  const selling = trade.direction === "sell";
  const input = selling ? side.vetro : side.counter;
  const usd = usdFor(input.symbol, references);
  return {
    direction: trade.direction,
    tradeAmount: formatAmount(trade.amountIn, input.decimals),
    tradeSymbol: input.symbol,
    tradeUsd: usd ? formatUsdWad(usdNotionalWad(trade.amountIn, input.decimals, usd)) : null,
    averagePrice: trade.averageWad ? formatPegPrice(trade.averageWad) : null,
    priceImpactBps: trade.averageWad && trade.spotWad > 0n ? deviationBps(trade.averageWad, trade.spotWad) : null,
    endPremiumBps: trade.endPriceWad ? deviationBps(trade.endPriceWad, fair) : null,
    tradeStatus: trade.status,
  };
}

function depth(aRaw: bigint, aToken: Address, bRaw: bigint, bToken: Address, references: References): string {
  const a = tokenMeta(aToken);
  const b = tokenMeta(bToken);
  const balances = `${formatAmount(aRaw, a.decimals)} ${a.symbol} / ${formatAmount(bRaw, b.decimals)} ${b.symbol}`;
  const usd = tvl([aRaw, aToken], [bRaw, bToken], references);
  return usd ? `${balances} · ${usd}` : balances;
}

function tvl(a: [bigint, Address], b: [bigint, Address], references: References): string | null {
  const left = usdLeg(a[0], a[1], references);
  const right = usdLeg(b[0], b[1], references);
  if (left === null && right === null) return null;
  return formatUsdWad((left ?? 0n) + (right ?? 0n));
}

function usdLeg(amount: bigint, token: Address, references: References): bigint | null {
  const meta = tokenMeta(token);
  const usd = usdFor(meta.symbol, references);
  if (!usd) return null;
  return usdNotionalWad(amount, meta.decimals, usd);
}

function baseRow(venue: Venue, side: Side, verified: boolean, model: string, feeLabel: string | null): PegRow {
  return {
    id: venue.id,
    peg: side.peg,
    chain: venue.chain,
    venue: venue.label,
    pair: `${side.vetro.symbol}/${side.counter.symbol}`,
    pool: getAddress(venue.pool),
    explorerUrl: explorerUrl(venue.chain, getAddress(venue.pool)),
    tradeUrl: buildTradeUrl(venue),
    verified,
    ok: false,
    model,
    feeLabel,
    poolPrice: null,
    fairValue: null,
    inversePrice: null,
    inverseFair: null,
    inverseUnit: null,
    premiumBps: null,
    direction: null,
    tradeAmount: null,
    tradeSymbol: null,
    tradeUsd: null,
    averagePrice: null,
    priceImpactBps: null,
    endPremiumBps: null,
    tradeStatus: "n/a",
    depth: null,
    tvlUsd: null,
    vetroSymbol: side.vetro.symbol,
    counterSymbol: side.counter.symbol,
    error: null,
    note: null,
    sim: null,
    excludeFromHeadline: false,
    counterparty: null,
  };
}

function errorRow(
  venue: Venue,
  verified: boolean,
  error: string,
  spot: bigint | null,
  quotes: Map<string, bigint | null>,
): PegRow {
  const base = tokenMeta(getAddress(venue.base));
  const quote = tokenMeta(getAddress(venue.quote));
  const peg = pegOf(base.symbol, quote.symbol);
  const vetro = base.symbol === peg ? base : quote;
  const counter = base.symbol === peg ? quote : base;
  const built: PegRow = {
    id: venue.id,
    peg,
    chain: venue.chain,
    venue: venue.label,
    pair: `${vetro.symbol}/${counter.symbol}`,
    pool: getAddress(venue.pool),
    explorerUrl: explorerUrl(venue.chain, getAddress(venue.pool)),
    tradeUrl: buildTradeUrl(venue),
    verified,
    ok: false,
    model: venue.kind,
    feeLabel: null,
    poolPrice: null,
    fairValue: null,
    inversePrice: null,
    inverseFair: null,
    inverseUnit: null,
    premiumBps: null,
    direction: null,
    tradeAmount: null,
    tradeSymbol: null,
    tradeUsd: null,
    averagePrice: null,
    priceImpactBps: null,
    endPremiumBps: null,
    tradeStatus: "n/a",
    depth: null,
    tvlUsd: null,
    vetroSymbol: vetro.symbol,
    counterSymbol: counter.symbol,
    error,
    note: null,
    sim: null,
    excludeFromHeadline: false,
    counterparty: null,
  };
  return annotateCounterparty(built, venue, spot, quotes);
}

function worstDiscounts(rows: PegRow[]): Record<PegAsset, WorstDiscount> {
  const worst = Object.fromEntries(PEGS.map((peg) => [peg, { bps: null, venue: null }])) as Record<
    PegAsset,
    WorstDiscount
  >;
  for (const row of rows) {
    if (row.excludeFromHeadline || row.premiumBps === null) continue;
    const current = worst[row.peg];
    if (current.bps === null || row.premiumBps < current.bps) {
      worst[row.peg] = { bps: row.premiumBps, venue: row.venue };
    }
  }
  return worst;
}

function alertReasons(rows: PegRow[], threshold: number): string[] {
  const reasons: string[] = [];
  for (const row of rows) {
    if (!row.verified && row.error) reasons.push(`${row.venue} failed verification`);
    else if (!row.ok && row.error) reasons.push(`${row.venue} could not be read`);
    else if (!row.excludeFromHeadline && row.premiumBps !== null && Math.abs(row.premiumBps) >= threshold) {
      reasons.push(`${row.venue} is ${row.premiumBps} bps from fair value`);
    }
  }
  if (reasons.length > 8) return [...reasons.slice(0, 8), `${reasons.length - 8} more`];
  return reasons;
}

async function loadCounterpartyQuotes(): Promise<Map<string, bigint | null>> {
  const ids = [
    ...new Set(
      VENUES.map((venue) => venue.counterpartyRisk?.coingeckoId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const entries = await Promise.all(
    ids.map(async (id) => [id, await coingeckoUsdWad(id)] as const),
  );
  return new Map(entries);
}

function annotateCounterparty(
  row: PegRow,
  venue: Venue,
  spot: bigint | null,
  quotes: Map<string, bigint | null>,
): PegRow {
  const risk = venue.counterpartyRisk;
  if (!risk) return { ...row, counterparty: null, excludeFromHeadline: false };
  const usd = quotes.get(risk.coingeckoId) ?? null;
  const tone = counterpartyTone(usd);
  const implied = usd && spot && spot > 0n ? impliedUsdPerTokenWad(spot, usd) : 0n;
  return {
    ...row,
    excludeFromHeadline: excludeCounterpartyFromHeadline(usd),
    counterparty: tone
      ? {
          symbol: risk.symbol,
          tone,
          href: risk.href,
          usdPrice: usd ? formatUsdWad(usd) : null,
          impliedUsd: implied > 0n ? formatUsdWad(implied) : null,
        }
      : null,
  };
}

function samePair(venue: Venue, coins: [Address, Address]): boolean {
  const configured = [getAddress(venue.base).toLowerCase(), getAddress(venue.quote).toLowerCase()].sort();
  const actual = [coins[0].toLowerCase(), coins[1].toLowerCase()].sort();
  return configured[0] === actual[0] && configured[1] === actual[1];
}

function pair(values: unknown[], index: [number, number]): [Address, Address] | null {
  const left = asAddress(values[index[0]]);
  const right = asAddress(values[index[1]]);
  if (!left || !right) return null;
  return [left, right];
}

function pairBig(values: unknown[], index: [number, number]): [bigint, bigint] | null {
  const left = asBigint(values[index[0]]);
  const right = asBigint(values[index[1]]);
  if (left === null || right === null) return null;
  return [left, right];
}

function positive(value: bigint | null): bigint | null {
  return value !== null && value > 0n ? value : null;
}

function asList(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asBigint(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

function asBigintArray(value: unknown): bigint[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "bigint")) return null;
  return value as bigint[];
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(value);
  }
  return null;
}
