import { deviationBps } from "./quote-math.ts";

const WAD = 10n ** 18n;

/** A quote stable this far from $1 is not a VUSD premium or discount. */
export const COUNTERPARTY_OFF_PAR_BPS = 200;

export type CounterpartyTone = "below" | "above" | "unknown";

export function usdPriceToWad(value: number): bigint | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const [whole, fraction = ""] = value.toFixed(8).split(".");
  const frac = fraction.padEnd(18, "0").slice(0, 18);
  return BigInt(whole) * WAD + BigInt(frac);
}

/** Pool quote-per-Vetro times the quote asset's USD price. */
export function impliedUsdPerTokenWad(poolCounterPerTokenWad: bigint, counterUsdWad: bigint): bigint {
  if (poolCounterPerTokenWad <= 0n || counterUsdWad <= 0n) return 0n;
  return (poolCounterPerTokenWad * counterUsdWad) / WAD;
}

export function counterpartyTone(counterUsdWad: bigint | null): CounterpartyTone | null {
  if (counterUsdWad === null) return "unknown";
  if (counterUsdWad < WAD) return "below";
  if (Math.abs(deviationBps(counterUsdWad)) > COUNTERPARTY_OFF_PAR_BPS) return "above";
  return null;
}

/** Drop the row from the VUSD headline while the quote is unknown or more than 2% off $1. */
export function excludeCounterpartyFromHeadline(counterUsdWad: bigint | null): boolean {
  if (counterUsdWad === null) return true;
  return Math.abs(deviationBps(counterUsdWad)) > COUNTERPARTY_OFF_PAR_BPS;
}
