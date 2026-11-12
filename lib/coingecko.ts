import { unstable_cache } from "next/cache";
import { usdPriceToWad } from "@/lib/counterparty";

const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";

/**
 * Public CoinGecko simple price. Cached for five minutes. Returns null on any failure.
 * No API key. The id is a CoinGecko slug, not a URL or secret.
 */
export async function coingeckoUsdWad(id: string): Promise<bigint | null> {
  try {
    const raw = await cachedUsd(id);
    return raw ? BigInt(raw) : null;
  } catch {
    return null;
  }
}

const cachedUsd = unstable_cache(
  async (id: string): Promise<string | null> => {
    const url = `${PRICE_URL}?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, { usd?: unknown }>;
    const usd = body[id]?.usd;
    if (typeof usd !== "number") return null;
    const wad = usdPriceToWad(usd);
    return wad ? wad.toString() : null;
  },
  ["coingecko-simple-usd-v1"],
  { revalidate: 300 },
);
