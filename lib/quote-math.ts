const WAD = 10n ** 18n;

/** Human price as a 1e18 fixed-point number. */
export function exchangeWad(
  amountOut: bigint,
  amountIn: bigint,
  decimalsIn: number,
  decimalsOut: number,
): bigint {
  if (amountIn <= 0n) throw new Error("amountIn must be positive");
  return (amountOut * 10n ** BigInt(decimalsIn) * WAD) / (amountIn * 10n ** BigInt(decimalsOut));
}

/**
 * Uniswap V3 / Sushi V3 slot0 price: token1 per token0, decimal-adjusted, 1e18 scale.
 * human = (sqrtPriceX96^2 / 2^192) * 10^(decimals0 - decimals1)
 */
export function v3Token1PerToken0Wad(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): bigint {
  if (sqrtPriceX96 <= 0n) return 0n;
  const numerator = sqrtPriceX96 * sqrtPriceX96 * 10n ** BigInt(decimals0) * WAD;
  const denominator = 2n ** 192n * 10n ** BigInt(decimals1);
  return numerator / denominator;
}

export function invertWad(priceWad: bigint): bigint {
  if (priceWad <= 0n) return 0n;
  return (WAD * WAD) / priceWad;
}

/** Signed basis points, rounded to nearest. 1 bp = 0.01%. */
export function deviationBps(quoteWad: bigint, fairWad: bigint = WAD): number {
  if (fairWad <= 0n) throw new Error("fair value must be positive");
  const delta = quoteWad - fairWad;
  const negative = delta < 0n;
  const magnitude = negative ? -delta : delta;
  const rounded = (magnitude * 10_000n + fairWad / 2n) / fairWad;
  const signed = negative ? -rounded : rounded;
  const asNumber = Number(signed);
  if (!Number.isSafeInteger(asNumber)) throw new Error("deviation is out of range");
  return asNumber;
}

export function formatUnits(value: bigint, decimals: number, digits = 2): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (digits <= 0) return `${negative ? "-" : ""}${wholeText}`;
  const fractionText = fraction.toString().padStart(decimals, "0").slice(0, digits);
  return `${negative ? "-" : ""}${wholeText}.${fractionText.padEnd(digits, "0")}`;
}

export function formatWad(wad: bigint, digits = 6): string {
  return formatUnits(wad, 18, digits);
}

/** Near-par quotes keep six decimals. Large cross rates, such as VUSD per BTC, keep two. */
export function formatPriceWad(wad: bigint): string {
  const absolute = wad < 0n ? -wad : wad;
  const digits = absolute >= 1_000n * WAD ? 2 : 6;
  return formatWad(wad, digits);
}

/** Peg quotes: six decimals near a dollar, eight when the price is a small BTC fraction. */
export function formatPegPrice(wad: bigint): string {
  const absolute = wad < 0n ? -wad : wad;
  if (absolute >= 1_000n * WAD) return formatWad(wad, 2);
  if (absolute >= WAD / 100n) return formatWad(wad, 6);
  return formatWad(wad, 8);
}

export function formatAmount(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const absolute = raw < 0n ? -raw : raw;
  const whole = absolute / scale;
  const digits = whole >= 1_000n ? 2 : whole >= 1n ? 4 : 6;
  return formatUnits(raw, decimals, digits);
}

export function formatUsdWad(wad: bigint | null): string | null {
  if (wad === null) return null;
  const absolute = wad < 0n ? -wad : wad;
  const digits = absolute >= 1_000n * WAD ? 0 : absolute >= WAD ? 2 : 4;
  return `$${formatUnits(wad, 18, digits)}`;
}

export function formatBps(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps} bps`;
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Trade size for a Curve quote. Prefer `targetWhole` tokens, but stay within 1% of
 * the input balance so a thin pool is not quoted as if it could fill the target.
 */
export function cappedQuoteAmount(balance: bigint, decimals: number, targetWhole: bigint): bigint {
  if (balance <= 0n) throw new Error("pool balance is empty");
  const target = targetWhole * 10n ** BigInt(decimals);
  const onePercent = balance / 100n;
  let amount = onePercent > 0n && onePercent < target ? onePercent : target;
  if (onePercent === 0n) amount = balance > 1n ? balance / 2n : 1n;
  if (amount >= balance) amount = balance / 2n > 0n ? balance / 2n : balance;
  if (amount <= 0n) amount = 1n;
  return amount;
}

/** Reward rate is tokens-per-second scaled by 1e18. Returns token base units per day. */
export function rewardPerDayRaw(rewardRate: bigint): bigint {
  return (rewardRate * 86_400n) / WAD;
}
