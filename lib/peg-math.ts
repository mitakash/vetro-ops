import { deviationBps, exchangeWad, invertWad, v3Token1PerToken0Wad } from "./quote-math.ts";

const WAD = 10n ** 18n;
const PRECISION = 10n ** 18n;
const A_PRECISION = 100n;
const FEE_DENOMINATOR = 10n ** 10n;
const Q96 = 2n ** 96n;
const V3_FEE_DENOM = 1_000_000n;

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

export type PegAsset = "VUSD" | "sVUSD" | "vetBTC" | "svetBTC";

const COUNTER_STABLES = new Set(["USDC", "USDT", "USDC.e", "frxUSD", "crvUSD", "msUSD"]);
const BTC_WRAPPERS = new Set(["WBTC", "cbBTC", "hemiBTC"]);

export type StablePoolState = {
  balances: bigint[];
  rates: bigint[];
  /** Curve `A_precise()` (`A * 100`). */
  ampPrecise: bigint;
  /** 1e10-scaled base fee. 1_000_000 is 1 bp. */
  fee: bigint;
  offpegFeeMultiplier: bigint;
};

export type TradeToFair = {
  status: "at-fair" | "ok" | "insufficient";
  /** Buy means the Vetro token is purchased (counter asset is the input). */
  direction: "buy" | "sell" | null;
  amountIn: bigint;
  amountOut: bigint;
  averageWad: bigint | null;
  endPriceWad: bigint | null;
  spotWad: bigint;
};

export type ClPool = {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  feePips: number;
  /** Bitmap compression. Uniswap v3 uses the pool tick spacing. BrownFi's table is indexed by the raw tick, so this is 1. */
  tickSpacing: number;
  bitmap: ReadonlyMap<number, bigint>;
  liquidityNet: ReadonlyMap<number, bigint>;
};

export type ClQuote = {
  zeroForOne: boolean;
  amountIn: bigint;
  amountOut: bigint;
  sqrtPriceX96: bigint;
  insufficient: boolean;
};

const USD_PEG: Record<PegAsset, boolean> = {
  VUSD: true,
  sVUSD: true,
  vetBTC: false,
  svetBTC: false,
};

export function isCounterStable(symbol: string): boolean {
  return COUNTER_STABLES.has(symbol);
}

export function isBtcWrapper(symbol: string): boolean {
  return BTC_WRAPPERS.has(symbol);
}

/**
 * Fair amount of the counter asset for one Vetro token, as a 1e18 fixed-point number.
 * Volatile pairs without a reference return null. Nothing here is invented.
 */
export function fairCounterPerVetroWad(input: {
  peg: PegAsset;
  counterSymbol: string;
  svusdNav: bigint | null;
  svetbtcNav: bigint | null;
  btcUsdWad: bigint | null;
  ethUsdWad: bigint | null;
}): bigint | null {
  const { peg, counterSymbol } = input;
  if (peg === "VUSD") {
    if (isCounterStable(counterSymbol)) return WAD;
    if (counterSymbol === "sVUSD" && input.svusdNav && input.svusdNav > 0n) return invertWad(input.svusdNav);
    if (isBtcWrapper(counterSymbol) && input.btcUsdWad && input.btcUsdWad > 0n) return invertWad(input.btcUsdWad);
    if (counterSymbol === "WETH" && input.ethUsdWad && input.ethUsdWad > 0n) return invertWad(input.ethUsdWad);
    return null;
  }
  if (peg === "sVUSD") {
    if (!input.svusdNav || input.svusdNav <= 0n) return null;
    if (counterSymbol === "VUSD" || isCounterStable(counterSymbol)) return input.svusdNav;
    return null;
  }
  if (peg === "vetBTC") {
    if (isBtcWrapper(counterSymbol)) return WAD;
    return null;
  }
  if (!input.svetbtcNav || input.svetbtcNav <= 0n) return null;
  if (counterSymbol === "vetBTC" || isBtcWrapper(counterSymbol)) return input.svetbtcNav;
  return null;
}

/** USD value of one whole token, 1e18 scale. */
export function usdPerTokenWad(input: {
  symbol: string;
  svusdNav: bigint | null;
  svetbtcNav: bigint | null;
  btcUsdWad: bigint | null;
  ethUsdWad: bigint | null;
}): bigint | null {
  const { symbol } = input;
  if (symbol === "VUSD" || isCounterStable(symbol)) return WAD;
  if (symbol === "sVUSD") return input.svusdNav && input.svusdNav > 0n ? input.svusdNav : null;
  if (symbol === "vetBTC" || isBtcWrapper(symbol)) return input.btcUsdWad && input.btcUsdWad > 0n ? input.btcUsdWad : null;
  if (symbol === "svetBTC") {
    if (!input.svetbtcNav || !input.btcUsdWad || input.svetbtcNav <= 0n || input.btcUsdWad <= 0n) return null;
    return (input.svetbtcNav * input.btcUsdWad) / WAD;
  }
  if (symbol === "WETH") return input.ethUsdWad && input.ethUsdWad > 0n ? input.ethUsdWad : null;
  return null;
}

export function usdNotionalWad(amountRaw: bigint, decimals: number, usdPerToken: bigint): bigint {
  if (amountRaw <= 0n || usdPerToken <= 0n) return 0n;
  return (amountRaw * usdPerToken) / 10n ** BigInt(decimals);
}

export function chainlinkAnswerToWad(answer: bigint, decimals = 8): bigint {
  if (answer <= 0n) return 0n;
  if (decimals > 18) return answer / 10n ** BigInt(decimals - 18);
  return answer * 10n ** BigInt(18 - decimals);
}

export function marginalDx(balance: bigint, decimals: number): bigint {
  if (balance <= 1n) return 1n;
  const dust = 10n ** BigInt(Math.max(0, decimals - 6));
  if (balance > dust * 10_000n) return dust;
  const slim = balance / 1_000n;
  return slim > 0n ? slim : 1n;
}

function xpOf(state: StablePoolState): bigint[] {
  return state.balances.map((balance, index) => (state.rates[index] * balance) / PRECISION);
}

function getD(xp: bigint[], amp: bigint): bigint {
  const n = BigInt(xp.length);
  let sum = 0n;
  for (const x of xp) sum += x;
  if (sum === 0n) return 0n;
  let d = sum;
  const ann = amp * n;
  const nPow = n ** n;
  for (let i = 0; i < 255; i++) {
    let dP = d;
    for (const x of xp) {
      if (x === 0n) return 0n;
      dP = (dP * d) / x;
    }
    dP /= nPow;
    const dPrev = d;
    const numerator = ((ann * sum) / A_PRECISION + dP * n) * d;
    const denominator = ((ann - A_PRECISION) * d) / A_PRECISION + (n + 1n) * dP;
    if (denominator === 0n) throw new Error("StableSwap D denominator is zero");
    d = numerator / denominator;
    if (d > dPrev ? d - dPrev <= 1n : dPrev - d <= 1n) return d;
  }
  throw new Error("StableSwap D did not converge");
}

function getY(i: number, j: number, x: bigint, xp: bigint[], amp: bigint, d: bigint): bigint {
  const n = BigInt(xp.length);
  const ann = amp * n;
  let s = 0n;
  let c = d;
  for (let k = 0; k < xp.length; k++) {
    if (k === j) continue;
    const xk = k === i ? x : xp[k];
    if (xk === 0n) throw new Error("StableSwap balance is zero");
    s += xk;
    c = (c * d) / (xk * n);
  }
  c = (c * d * A_PRECISION) / (ann * n);
  const b = s + (d * A_PRECISION) / ann;
  let y = d;
  for (let k = 0; k < 255; k++) {
    const yPrev = y;
    const denom = 2n * y + b - d;
    if (denom <= 0n) throw new Error("StableSwap y denominator is invalid");
    y = (y * y + c) / denom;
    if (y > yPrev ? y - yPrev <= 1n : yPrev - y <= 1n) return y;
  }
  throw new Error("StableSwap y did not converge");
}

function dynamicFee(xpi: bigint, xpj: bigint, fee: bigint, offpeg: bigint): bigint {
  if (offpeg <= FEE_DENOMINATOR || xpi <= 0n || xpj <= 0n) return fee;
  const sum = xpi + xpj;
  const xps2 = sum * sum;
  const numerator = (offpeg - FEE_DENOMINATOR) * 4n * xpi * xpj;
  return (offpeg * fee) / (numerator / xps2 + FEE_DENOMINATOR);
}

/** StableSwap-NG `get_dy`, including the dynamic fee and stored rates. */
export function stableGetDy(state: StablePoolState, i: number, j: number, dx: bigint): bigint {
  if (i === j) throw new Error("StableSwap coin indexes must differ");
  if (dx <= 0n) return 0n;
  if (!state.balances[i] || !state.balances[j] || !state.rates[i] || !state.rates[j]) {
    throw new Error("StableSwap state is incomplete");
  }
  const xp = xpOf(state);
  const d = getD(xp, state.ampPrecise);
  const x = xp[i] + (dx * state.rates[i]) / PRECISION;
  const y = getY(i, j, x, xp, state.ampPrecise, d);
  if (y >= xp[j]) return 0n;
  const dy = xp[j] - y - 1n;
  const fee = dynamicFee((xp[i] + x) / 2n, (xp[j] + y) / 2n, state.fee, state.offpegFeeMultiplier);
  const dyFee = (dy * fee) / FEE_DENOMINATOR;
  if (dyFee >= dy) return 0n;
  return ((dy - dyFee) * PRECISION) / state.rates[j];
}

export function stableMarginalWad(
  state: StablePoolState,
  vetroIndex: number,
  counterIndex: number,
  vetroDecimals: number,
  counterDecimals: number,
): bigint {
  const dx = marginalDx(state.balances[vetroIndex] ?? 0n, vetroDecimals);
  const dy = stableGetDy(state, vetroIndex, counterIndex, dx);
  if (dy <= 0n) return 0n;
  return exchangeWad(dy, dx, vetroDecimals, counterDecimals);
}

function withBalances(state: StablePoolState, balances: bigint[]): StablePoolState {
  return { ...state, balances };
}

/**
 * Smallest input that moves the marginal StableSwap price (a tiny `get_dy` of the Vetro token)
 * to within about 1 bp of fair value.
 */
export function tradeStableToFair(
  state: StablePoolState,
  vetroIndex: number,
  counterIndex: number,
  vetroDecimals: number,
  counterDecimals: number,
  fairWad: bigint,
): TradeToFair {
  const spot = stableMarginalWad(state, vetroIndex, counterIndex, vetroDecimals, counterDecimals);
  const blank = { amountIn: 0n, amountOut: 0n, averageWad: null, endPriceWad: spot, spotWad: spot };
  if (spot <= 0n || fairWad <= 0n) return { ...blank, status: "insufficient", direction: null };
  if (Math.abs(deviationBps(spot, fairWad)) <= 1) {
    return { ...blank, status: "at-fair", direction: null, endPriceWad: spot };
  }
  const buy = spot < fairWad;
  const inputIndex = buy ? counterIndex : vetroIndex;
  const outputIndex = buy ? vetroIndex : counterIndex;
  const outputBalance = state.balances[outputIndex] ?? 0n;
  if (outputBalance <= 1n) return { ...blank, status: "insufficient", direction: buy ? "buy" : "sell" };

  const priceAfter = (dx: bigint) => {
    let dy: bigint;
    try {
      dy = stableGetDy(state, inputIndex, outputIndex, dx);
    } catch {
      return null;
    }
    if (dy <= 0n || dy >= outputBalance) return null;
    const balances = state.balances.slice();
    balances[inputIndex] += dx;
    balances[outputIndex] -= dy;
    let end: bigint;
    try {
      end = stableMarginalWad(withBalances(state, balances), vetroIndex, counterIndex, vetroDecimals, counterDecimals);
    } catch {
      return null;
    }
    if (end <= 0n) return null;
    return { dy, end };
  };

  let hi = marginalDx(state.balances[inputIndex] ?? 0n, buy ? counterDecimals : vetroDecimals);
  let frontier: { dx: bigint; dy: bigint; end: bigint } | null = null;
  for (let i = 0; i < 72; i++) {
    const quote = priceAfter(hi);
    if (!quote) break;
    frontier = { dx: hi, dy: quote.dy, end: quote.end };
    const reached = buy ? quote.end >= fairWad : quote.end <= fairWad;
    if (reached) break;
    const next = hi * 2n;
    if (next <= hi) break;
    hi = next;
  }
  if (!frontier) {
    return { ...blank, status: "insufficient", direction: buy ? "buy" : "sell" };
  }
  const crossed = buy ? frontier.end >= fairWad : frontier.end <= fairWad;
  if (!crossed) {
    return finishStableTrade(buy, frontier.dx, frontier.dy, frontier.end, spot, vetroDecimals, counterDecimals, "insufficient");
  }

  let low = 0n;
  let high = frontier.dx;
  let best = frontier;
  for (let i = 0; i < 48 && high - low > 1n; i++) {
    const mid = (low + high) / 2n;
    const quote = priceAfter(mid);
    if (!quote) {
      high = mid;
      continue;
    }
    const reached = buy ? quote.end >= fairWad : quote.end <= fairWad;
    if (reached) {
      high = mid;
      best = { dx: mid, dy: quote.dy, end: quote.end };
    } else {
      low = mid;
    }
  }
  const status = Math.abs(deviationBps(best.end, fairWad)) <= 1 ? "ok" : "insufficient";
  return finishStableTrade(buy, best.dx, best.dy, best.end, spot, vetroDecimals, counterDecimals, status);
}

function finishStableTrade(
  buy: boolean,
  amountIn: bigint,
  amountOut: bigint,
  end: bigint,
  spot: bigint,
  vetroDecimals: number,
  counterDecimals: number,
  status: "ok" | "insufficient",
): TradeToFair {
  const averageWad = buy
    ? exchangeWad(amountIn, amountOut, counterDecimals, vetroDecimals)
    : exchangeWad(amountOut, amountIn, vetroDecimals, counterDecimals);
  return {
    status,
    direction: buy ? "buy" : "sell",
    amountIn,
    amountOut,
    averageWad,
    endPriceWad: end,
    spotWad: spot,
  };
}

export function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("square root of a negative");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/** Uniswap v3 `TickMath.getSqrtRatioAtTick`. Ratios are the canonical magic constants. */
export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = tick < 0 ? -tick : tick;
  if (absTick > MAX_TICK) throw new Error("tick out of range");
  let ratio =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  const remainder = ratio % (1n << 32n);
  let sqrtPrice = ratio >> 32n;
  if (remainder > 0n) sqrtPrice += 1n;
  return sqrtPrice;
}

export function sqrtPriceX96ForToken1PerToken0(humanWad: bigint, decimals0: number, decimals1: number): bigint {
  if (humanWad <= 0n) throw new Error("price must be positive");
  const numerator = humanWad * 10n ** BigInt(decimals1) * (1n << 192n);
  const denominator = WAD * 10n ** BigInt(decimals0);
  const sqrtPrice = isqrt(numerator / denominator);
  if (sqrtPrice <= MIN_SQRT_RATIO) return MIN_SQRT_RATIO + 1n;
  if (sqrtPrice >= MAX_SQRT_RATIO) return MAX_SQRT_RATIO - 1n;
  return sqrtPrice;
}

function divRoundingUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division by zero");
  return (numerator + denominator - 1n) / denominator;
}

function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

function mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const product = a * b;
  const result = product / denominator;
  if (product % denominator === 0n) return result;
  return result + 1n;
}

export function amount0Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  if (liquidity === 0n || sqrtA === sqrtB) return 0n;
  let left = sqrtA;
  let right = sqrtB;
  if (left > right) {
    left = sqrtB;
    right = sqrtA;
  }
  const numerator1 = liquidity << 96n;
  const numerator2 = right - left;
  if (roundUp) return divRoundingUp(mulDivRoundingUp(numerator1, numerator2, right), left);
  return mulDiv(numerator1, numerator2, right) / left;
}

export function amount1Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  if (liquidity === 0n || sqrtA === sqrtB) return 0n;
  const delta = sqrtA > sqrtB ? sqrtA - sqrtB : sqrtB - sqrtA;
  if (roundUp) return mulDivRoundingUp(liquidity, delta, Q96);
  return (liquidity * delta) / Q96;
}

function mostSignificantBit(value: bigint): number {
  if (value <= 0n) throw new Error("most significant bit of zero");
  let x = value;
  let n = 0;
  for (const shift of [128, 64, 32, 16, 8, 4, 2, 1]) {
    const step = 1n << BigInt(shift);
    if (x >= step) {
      x >>= BigInt(shift);
      n += shift;
    }
  }
  return n;
}

function leastSignificantBit(value: bigint): number {
  if (value <= 0n) throw new Error("least significant bit of zero");
  let x = value;
  let n = 0;
  for (const shift of [128, 64, 32, 16, 8, 4, 2, 1]) {
    const mask = (1n << BigInt(shift)) - 1n;
    if ((x & mask) === 0n) {
      n += shift;
      x >>= BigInt(shift);
    }
  }
  return n;
}

function compressedTick(tick: number, tickSpacing: number): number {
  let compressed = Math.trunc(tick / tickSpacing);
  if (tick < 0 && tick % tickSpacing !== 0) compressed -= 1;
  return compressed;
}

/** Next initialized tick inside one bitmap word. `lte` searches toward lower prices. */
export function nextInitializedTick(
  bitmap: ReadonlyMap<number, bigint>,
  tick: number,
  tickSpacing: number,
  lte: boolean,
): { tick: number; initialized: boolean; wordLoaded: boolean } {
  const compressed = compressedTick(tick, tickSpacing);
  if (lte) {
    const wordPos = compressed >> 8;
    const bitPos = compressed & 255;
    const word = bitmap.get(wordPos);
    const mask = (1n << BigInt(bitPos + 1)) - 1n;
    const masked = (word ?? 0n) & mask;
    const initialized = masked !== 0n;
    const next = initialized
      ? (compressed - (bitPos - mostSignificantBit(masked))) * tickSpacing
      : (compressed - bitPos) * tickSpacing;
    return { tick: next, initialized, wordLoaded: word !== undefined };
  }
  const wordPos = (compressed + 1) >> 8;
  const bitPos = (compressed + 1) & 255;
  const word = bitmap.get(wordPos);
  const mask = ((1n << 256n) - 1n) ^ ((1n << BigInt(bitPos)) - 1n);
  const masked = (word ?? 0n) & mask;
  const initialized = masked !== 0n;
  const next = initialized
    ? (compressed + 1 + (leastSignificantBit(masked) - bitPos)) * tickSpacing
    : (compressed + 1 + (255 - bitPos)) * tickSpacing;
  return { tick: next, initialized, wordLoaded: word !== undefined };
}

function clampTick(tick: number): number {
  if (tick < MIN_TICK) return MIN_TICK;
  if (tick > MAX_TICK) return MAX_TICK;
  return tick;
}

function addLiquidity(liquidity: bigint, net: bigint): bigint {
  const next = liquidity + net;
  return next < 0n ? 0n : next;
}

/**
 * Swap input required to move the current sqrt price to `sqrtPriceLimitX96`.
 * The fee is taken from the input, matching Uniswap v3.
 */
export function quoteToSqrtPrice(pool: ClPool, sqrtPriceLimitX96: bigint): ClQuote {
  const zeroForOne = sqrtPriceLimitX96 < pool.sqrtPriceX96;
  let sqrt = pool.sqrtPriceX96;
  let tick = pool.tick;
  let liquidity = pool.liquidity;
  let amountIn = 0n;
  let amountOut = 0n;
  let insufficient = false;
  if (sqrt === sqrtPriceLimitX96) {
    return { zeroForOne, amountIn, amountOut, sqrtPriceX96: sqrt, insufficient: false };
  }
  if (liquidity === 0n) {
    return { zeroForOne, amountIn, amountOut, sqrtPriceX96: sqrt, insufficient: true };
  }
  for (let step = 0; step < 80 && sqrt !== sqrtPriceLimitX96; step++) {
    const found = nextInitializedTick(pool.bitmap, tick, pool.tickSpacing, zeroForOne);
    if (!found.wordLoaded && !found.initialized) {
      insufficient = true;
      break;
    }
    const tickNext = clampTick(found.tick);
    const sqrtNext = getSqrtRatioAtTick(tickNext);
    const sqrtGoal = zeroForOne
      ? sqrtNext > sqrtPriceLimitX96
        ? sqrtNext
        : sqrtPriceLimitX96
      : sqrtNext < sqrtPriceLimitX96
        ? sqrtNext
        : sqrtPriceLimitX96;
    if (liquidity === 0n) {
      insufficient = true;
      break;
    }
    const inCurve = zeroForOne
      ? amount0Delta(sqrt, sqrtGoal, liquidity, true)
      : amount1Delta(sqrt, sqrtGoal, liquidity, true);
    const outCurve = zeroForOne
      ? amount1Delta(sqrt, sqrtGoal, liquidity, false)
      : amount0Delta(sqrt, sqrtGoal, liquidity, false);
    const fee = BigInt(pool.feePips);
    if (sqrtGoal === sqrt) {
      insufficient = true;
      break;
    }
    const paid =
      fee <= 0n || fee >= V3_FEE_DENOM ? inCurve : divRoundingUp(inCurve * V3_FEE_DENOM, V3_FEE_DENOM - fee);
    amountIn += paid;
    amountOut += outCurve;
    sqrt = sqrtGoal;
    if (sqrt === sqrtNext) {
      if (found.initialized) {
        const net = pool.liquidityNet.get(tickNext);
        if (net === undefined) {
          insufficient = true;
          break;
        }
        liquidity = addLiquidity(liquidity, zeroForOne ? -net : net);
      }
      tick = zeroForOne ? tickNext - 1 : tickNext;
    }
  }
  if (sqrt !== sqrtPriceLimitX96) insufficient = true;
  return { zeroForOne, amountIn, amountOut, sqrtPriceX96: sqrt, insufficient };
}

function nextSqrtFromInput(
  sqrt: bigint,
  liquidity: bigint,
  amountInCurve: bigint,
  zeroForOne: boolean,
): bigint {
  if (amountInCurve <= 0n || liquidity === 0n) return sqrt;
  if (zeroForOne) {
    const numerator1 = liquidity << 96n;
    const product = amountInCurve * sqrt;
    const denominator = numerator1 + product;
    if (denominator === 0n) return sqrt;
    return mulDivRoundingUp(numerator1, sqrt, denominator);
  }
  return sqrt + (amountInCurve << 96n) / liquidity;
}

/** Exact-input quote used by the "what if I trade X" control. */
export function quoteExactInput(pool: ClPool, zeroForOne: boolean, amountIn: bigint): ClQuote {
  let sqrt = pool.sqrtPriceX96;
  let tick = pool.tick;
  let liquidity = pool.liquidity;
  let remaining = amountIn;
  let amountOut = 0n;
  let consumed = 0n;
  let insufficient = false;
  if (amountIn <= 0n) {
    return { zeroForOne, amountIn: 0n, amountOut: 0n, sqrtPriceX96: sqrt, insufficient: false };
  }
  const limit = zeroForOne ? MIN_SQRT_RATIO + 1n : MAX_SQRT_RATIO - 1n;
  for (let step = 0; step < 80 && remaining > 0n && sqrt !== limit; step++) {
    const found = nextInitializedTick(pool.bitmap, tick, pool.tickSpacing, zeroForOne);
    if (!found.wordLoaded && !found.initialized) {
      insufficient = true;
      break;
    }
    const tickNext = clampTick(found.tick);
    const sqrtNext = getSqrtRatioAtTick(tickNext);
    const sqrtGoal = zeroForOne ? (sqrtNext > limit ? sqrtNext : limit) : sqrtNext < limit ? sqrtNext : limit;
    if (liquidity === 0n) {
      insufficient = true;
      break;
    }
    const inToGoal = zeroForOne
      ? amount0Delta(sqrt, sqrtGoal, liquidity, true)
      : amount1Delta(sqrt, sqrtGoal, liquidity, true);
    const fee = BigInt(pool.feePips);
    const paidToGoal =
      fee <= 0n || fee >= V3_FEE_DENOM ? inToGoal : divRoundingUp(inToGoal * V3_FEE_DENOM, V3_FEE_DENOM - fee);
    if (paidToGoal <= remaining) {
      const outCurve = zeroForOne
        ? amount1Delta(sqrt, sqrtGoal, liquidity, false)
        : amount0Delta(sqrt, sqrtGoal, liquidity, false);
      remaining -= paidToGoal;
      consumed += paidToGoal;
      amountOut += outCurve;
      sqrt = sqrtGoal;
      if (sqrt === sqrtNext && found.initialized) {
        const net = pool.liquidityNet.get(tickNext);
        if (net === undefined) {
          insufficient = true;
          break;
        }
        liquidity = addLiquidity(liquidity, zeroForOne ? -net : net);
        tick = zeroForOne ? tickNext - 1 : tickNext;
      } else if (sqrt === sqrtNext) {
        tick = zeroForOne ? tickNext - 1 : tickNext;
      }
      continue;
    }
    const inCurve =
      fee <= 0n || fee >= V3_FEE_DENOM ? remaining : (remaining * (V3_FEE_DENOM - fee)) / V3_FEE_DENOM;
    const sqrtNextPrice = nextSqrtFromInput(sqrt, liquidity, inCurve, zeroForOne);
    const outCurve = zeroForOne
      ? amount1Delta(sqrt, sqrtNextPrice, liquidity, false)
      : amount0Delta(sqrt, sqrtNextPrice, liquidity, false);
    consumed += remaining;
    amountOut += outCurve;
    sqrt = sqrtNextPrice;
    remaining = 0n;
  }
  if (remaining > 0n) insufficient = true;
  return { zeroForOne, amountIn: consumed, amountOut, sqrtPriceX96: sqrt, insufficient };
}

export function counterPerVetroWad(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
  vetroIsToken0: boolean,
): bigint {
  const token1PerToken0 = v3Token1PerToken0Wad(sqrtPriceX96, decimals0, decimals1);
  return vetroIsToken0 ? token1PerToken0 : invertWad(token1PerToken0);
}

export function targetSqrtPrice(input: {
  fairWad: bigint;
  decimals0: number;
  decimals1: number;
  vetroIsToken0: boolean;
}): bigint {
  const token1PerToken0 = input.vetroIsToken0 ? input.fairWad : invertWad(input.fairWad);
  return sqrtPriceX96ForToken1PerToken0(token1PerToken0, input.decimals0, input.decimals1);
}

export function bitmapWord(tick: number, tickSpacing: number): number {
  return compressedTick(tick, tickSpacing) >> 8;
}

/** Rough tick for choosing which bitmap words to read. Amounts never use this estimate. */
export function approximateTick(sqrtPriceX96: bigint): number {
  const ratio = Number(sqrtPriceX96) / Number(Q96);
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const tick = Math.log(ratio * ratio) / Math.log(1.0001);
  if (!Number.isFinite(tick)) return 0;
  return Math.max(MIN_TICK, Math.min(MAX_TICK, Math.trunc(tick)));
}

export function pegUsesUsd(peg: PegAsset): boolean {
  return USD_PEG[peg];
}
