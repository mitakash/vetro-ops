import type { ClSim, CurveSim, PoolSim } from "./peg-types.ts";
import {
  counterPerVetroExecutionWad,
  counterPerVetroWad,
  quoteExactInput,
  stableGetDy,
  stableMarginalWad,
  type ClPool,
  type StablePoolState,
} from "./peg-math.ts";
import { deviationBps, formatAmount, formatPegPrice } from "./quote-math.ts";

const BTC_SYMBOLS = new Set(["WBTC", "cbBTC", "hemiBTC", "vetBTC", "svetBTC"]);

export type WhatIfResult =
  | { ok: false; message: string }
  | {
      ok: true;
      payAmount: string;
      paySymbol: string;
      receiveAmount: string;
      receiveSymbol: string;
      averagePrice: string;
      averageUnit: string;
      priceImpactBps: number;
      endPremiumBps: number | null;
      /** The trade crosses through fair value to the other side. Null when fair value is unknown. */
      overshoots: boolean | null;
      partial: boolean;
    };

export function parseDecimalAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  try {
    const raw = BigInt(whole + fraction.padEnd(decimals, "0"));
    return raw > 0n ? raw : null;
  } catch {
    return null;
  }
}

export function sizePresets(input: {
  symbol: string;
  fairValue: string | null;
  poolPrice: string | null;
  /** True when the typed amount is the paired asset, not the Vetro token. */
  inputIsCounter: boolean;
}): { label: string; amount: string }[] {
  if (BTC_SYMBOLS.has(input.symbol)) {
    return [
      { label: "1", amount: "1" },
      { label: "10", amount: "10" },
      { label: "100", amount: "100" },
    ];
  }
  return [
    { label: "$1K", amount: amountForUsd(1_000, input) },
    { label: "$10K", amount: amountForUsd(10_000, input) },
    { label: "$100K", amount: amountForUsd(100_000, input) },
  ];
}

export function quoteWhatIf(sim: PoolSim, side: "buy" | "sell", amountText: string): WhatIfResult {
  const decimals = inputDecimals(sim, side);
  const raw = parseDecimalAmount(amountText, decimals);
  if (raw === null) return { ok: false, message: "Enter a positive amount with no more decimals than the token allows." };
  if (sim.kind === "curve") return quoteCurve(sim, side, raw);
  return quoteCl(sim, side, raw);
}

function quoteCurve(sim: CurveSim, side: "buy" | "sell", amount: bigint): WhatIfResult {
  const state: StablePoolState = {
    balances: [BigInt(sim.balances[0]), BigInt(sim.balances[1])],
    rates: [BigInt(sim.rates[0]), BigInt(sim.rates[1])],
    ampPrecise: BigInt(sim.ampPrecise),
    fee: BigInt(sim.fee),
    offpegFeeMultiplier: BigInt(sim.offpegFeeMultiplier),
  };
  const inputIndex = side === "buy" ? sim.counterIndex : sim.vetroIndex;
  const outputIndex = side === "buy" ? sim.vetroIndex : sim.counterIndex;
  const paySymbol = sim.symbols[inputIndex];
  const receiveSymbol = sim.symbols[outputIndex];
  let dy: bigint;
  try {
    dy = stableGetDy(state, inputIndex, outputIndex, amount);
  } catch {
    return { ok: false, message: "That size cannot be quoted on this pool." };
  }
  if (dy <= 0n || dy * 100n >= state.balances[outputIndex] * 99n) {
    return {
      ok: false,
      message: `That size is larger than this pool's ${receiveSymbol} balance.`,
    };
  }
  const balances = state.balances.slice();
  balances[inputIndex] += amount;
  balances[outputIndex] -= dy;
  const spot = stableMarginalWad(
    state,
    sim.vetroIndex,
    sim.counterIndex,
    sim.decimals[sim.vetroIndex],
    sim.decimals[sim.counterIndex],
  );
  const end = stableMarginalWad(
    { ...state, balances },
    sim.vetroIndex,
    sim.counterIndex,
    sim.decimals[sim.vetroIndex],
    sim.decimals[sim.counterIndex],
  );
  const average = counterPerVetroExecutionWad({
    counterAmount: side === "sell" ? dy : amount,
    vetroAmount: side === "sell" ? amount : dy,
    vetroDecimals: sim.decimals[sim.vetroIndex],
    counterDecimals: sim.decimals[sim.counterIndex],
  });
  return finish({
    payAmount: formatAmount(amount, sim.decimals[inputIndex]),
    paySymbol,
    receiveAmount: formatAmount(dy, sim.decimals[outputIndex]),
    receiveSymbol,
    average,
    counterSymbol: sim.symbols[sim.counterIndex],
    vetroSymbol: sim.symbols[sim.vetroIndex],
    spot,
    end,
    fairWad: sim.fairWad,
    partial: false,
  });
}

function quoteCl(sim: ClSim, side: "buy" | "sell", amount: bigint): WhatIfResult {
  const pool: ClPool = {
    sqrtPriceX96: BigInt(sim.sqrtPriceX96),
    tick: sim.tick,
    liquidity: BigInt(sim.liquidity),
    feePips: sim.feePips,
    tickSpacing: sim.tickSpacing,
    bitmap: new Map(sim.bitmap.map((word) => [word.word, BigInt(word.value)])),
    liquidityNet: new Map(sim.ticks.map((tick) => [tick.tick, BigInt(tick.liquidityNet)])),
  };
  if (pool.liquidity === 0n) {
    return { ok: false, message: "No active liquidity in the current tick, so this pool cannot be quoted." };
  }
  const zeroForOne = side === "sell" ? sim.vetroIsToken0 : !sim.vetroIsToken0;
  const quote = quoteExactInput(pool, zeroForOne, amount);
  const vetroDecimals = sim.vetroIsToken0 ? sim.decimals0 : sim.decimals1;
  const counterDecimals = sim.vetroIsToken0 ? sim.decimals1 : sim.decimals0;
  const vetroSymbol = sim.vetroIsToken0 ? sim.symbol0 : sim.symbol1;
  const counterSymbol = sim.vetroIsToken0 ? sim.symbol1 : sim.symbol0;
  const paySymbol = side === "sell" ? vetroSymbol : counterSymbol;
  const receiveSymbol = side === "sell" ? counterSymbol : vetroSymbol;
  const payDecimals = side === "sell" ? vetroDecimals : counterDecimals;
  const receiveDecimals = side === "sell" ? counterDecimals : vetroDecimals;
  if (quote.insufficient || quote.amountOut <= 0n || quote.amountIn <= 0n) {
    return { ok: false, message: "That size exceeds the loaded pool depth." };
  }
  const spot = counterPerVetroWad(pool.sqrtPriceX96, sim.decimals0, sim.decimals1, sim.vetroIsToken0);
  const end = counterPerVetroWad(quote.sqrtPriceX96, sim.decimals0, sim.decimals1, sim.vetroIsToken0);
  const average = counterPerVetroExecutionWad({
    counterAmount: side === "sell" ? quote.amountOut : quote.amountIn,
    vetroAmount: side === "sell" ? quote.amountIn : quote.amountOut,
    vetroDecimals,
    counterDecimals,
  });
  return finish({
    payAmount: formatAmount(quote.amountIn, payDecimals),
    paySymbol,
    receiveAmount: formatAmount(quote.amountOut, receiveDecimals),
    receiveSymbol,
    average,
    counterSymbol,
    vetroSymbol,
    spot,
    end,
    fairWad: sim.fairWad,
    partial: quote.insufficient,
  });
}

function finish(input: {
  payAmount: string;
  paySymbol: string;
  receiveAmount: string;
  receiveSymbol: string;
  average: bigint;
  counterSymbol: string;
  vetroSymbol: string;
  spot: bigint;
  end: bigint;
  fairWad: string | null;
  partial: boolean;
}): WhatIfResult {
  const fair = input.fairWad ? BigInt(input.fairWad) : null;
  const endPremiumBps = fair && input.end > 0n ? deviationBps(input.end, fair) : null;
  const startBps = fair && input.spot > 0n ? deviationBps(input.spot, fair) : null;
  const overshoots =
    startBps === null || endPremiumBps === null
      ? null
      : (startBps < 0 && endPremiumBps > 1) || (startBps > 0 && endPremiumBps < -1);
  return {
    ok: true,
    payAmount: input.payAmount,
    paySymbol: input.paySymbol,
    receiveAmount: input.receiveAmount,
    receiveSymbol: input.receiveSymbol,
    averagePrice: formatPegPrice(input.average),
    averageUnit: `${input.counterSymbol} per ${input.vetroSymbol}`,
    priceImpactBps: input.spot > 0n ? deviationBps(input.average, input.spot) : 0,
    endPremiumBps,
    overshoots,
    partial: input.partial,
  };
}

function inputDecimals(sim: PoolSim, side: "buy" | "sell"): number {
  if (sim.kind === "curve") return sim.decimals[side === "buy" ? sim.counterIndex : sim.vetroIndex];
  const vetro = sim.vetroIsToken0 ? sim.decimals0 : sim.decimals1;
  const counter = sim.vetroIsToken0 ? sim.decimals1 : sim.decimals0;
  return side === "sell" ? vetro : counter;
}

function amountForUsd(
  dollars: number,
  input: { symbol: string; fairValue: string | null; poolPrice: string | null; inputIsCounter: boolean },
): string {
  if (input.symbol === "sVUSD") {
    const nav = Number(input.fairValue);
    if (nav > 0) return trim(dollars / nav);
  }
  if ((input.symbol === "WETH" || input.symbol === "HEMI") && input.inputIsCounter) {
    const perVetro = Number(input.poolPrice);
    if (perVetro > 0) return trim(dollars * perVetro);
  }
  return String(dollars);
}

function trim(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const digits = value >= 1_000 ? 2 : value >= 1 ? 4 : 6;
  return value.toFixed(digits).replace(/\.?0+$/, "");
}
