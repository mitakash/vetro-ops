/** Public Ethereum endpoint. It refuses eth_getLogs older than about 12,000 blocks. */
export const PUBLIC_ETH_RPC = "https://ethereum-rpc.publicnode.com";

/** Lookback used when gateway logs are read from the public node. */
export const PUBLIC_LOG_LOOKBACK_BLOCKS = 12_000;

/**
 * Lookback used when Infura serves gateway logs. Infura accepts ranges older
 * than the public node's cap.
 */
export const INFURA_LOG_LOOKBACK_BLOCKS = 50_000;

export type RpcProviderName = "infura" | "public";

export type RpcEndpoint = {
  provider: RpcProviderName;
  url: string;
};

function usableRpc(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url.trim()));
}

/**
 * Ethereum read order: Infura, then ETH_RPC_URL, then the public node.
 * Duplicate URLs are skipped. Labels never include the URL itself.
 */
export function ethereumRpcPlan(input: { infuraUrl?: string; ethUrl?: string }): RpcEndpoint[] {
  const plan: RpcEndpoint[] = [];
  const seen = new Set<string>();
  const add = (provider: RpcProviderName, url: string | undefined) => {
    if (!usableRpc(url)) return;
    const trimmed = url.trim();
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    plan.push({ provider, url: trimmed });
  };
  add("infura", input.infuraUrl);
  add("public", input.ethUrl);
  add("public", PUBLIC_ETH_RPC);
  return plan;
}

export function gatewayLookbackBlocks(provider: RpcProviderName): number {
  return provider === "infura" ? INFURA_LOG_LOOKBACK_BLOCKS : PUBLIC_LOG_LOOKBACK_BLOCKS;
}
