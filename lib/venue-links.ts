export type LinkChain = "ethereum" | "hemi";
export type LinkKind = "curve-stableswap" | "curve-crypto" | "v3" | "algebra";

export type TradeLinkInput = {
  chain: LinkChain;
  kind: LinkKind;
  pool: string;
  /** Optional per-venue override. Used instead of the builder. */
  tradeUrl?: string;
};

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * Pool page where a person can trade. A configured `tradeUrl` wins.
 * Curve uses the address swap route, which the Curve app serves directly.
 * A non-address id falls back to the pool search page.
 */
export function buildTradeUrl(venue: TradeLinkInput): string {
  if (venue.tradeUrl) return venue.tradeUrl;
  const pool = venue.pool;
  if (venue.kind === "curve-stableswap" || venue.kind === "curve-crypto") {
    const network = venue.chain === "hemi" ? "hemi" : "ethereum";
    if (ADDRESS.test(pool)) return `https://www.curve.finance/dex/${network}/pools/${pool}/swap`;
    return `https://www.curve.finance/dex/${network}/pools?search=${encodeURIComponent(pool)}`;
  }
  if (venue.kind === "v3") {
    const chain = venue.chain === "hemi" ? "hemi" : "ethereum";
    return `https://app.uniswap.org/explore/pools/${chain}/${pool}`;
  }
  if (venue.chain === "hemi") return `https://app.brownfi.io/clamm/pool/${pool}`;
  return explorerUrl(venue.chain, pool);
}

export function explorerUrl(chain: LinkChain, pool: string): string {
  if (chain === "hemi") return `https://explorer.hemi.xyz/address/${pool}`;
  return `https://etherscan.io/address/${pool}`;
}
