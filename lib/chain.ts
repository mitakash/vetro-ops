import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  type PublicClient,
  type Transport,
} from "viem";
import { mainnet } from "viem/chains";
import { DEFAULT_DRIP_MAX_VUSD, DEFAULT_PEG_ALERT_BPS } from "@/lib/contracts";
import {
  ethereumRpcPlan,
  type RpcEndpoint,
  type RpcProviderName,
} from "@/lib/rpc-plan";

/**
 * Public Hemi mainnet RPC (chain 43111). About 300 requests per minute.
 * Not a secret. This is the default when HEMI_RPC_URL is unset.
 * Never sent to the browser.
 */
const PUBLIC_HEMI_RPC = "https://rpc.hemi.network/rpc";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

function usableRpc(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function unique(urls: Array<string | undefined>): string[] {
  return [...new Set(urls.filter(usableRpc))];
}

/** Infura, then ETH_RPC_URL, then the public node. URLs stay on the server. */
export function ethereumEndpoints(): RpcEndpoint[] {
  return ethereumRpcPlan({
    infuraUrl: process.env.INFURA_RPC_URL,
    ethUrl: process.env.ETH_RPC_URL,
  });
}

export function ethRpcUrls(): string[] {
  return ethereumEndpoints().map((endpoint) => endpoint.url);
}

let lastEthereumProvider: RpcProviderName | null = null;

export function resetEthereumProvider(): void {
  lastEthereumProvider = null;
}

/** Provider that served the latest successful Ethereum JSON-RPC request. Never a URL. */
export function ethereumProviderInUse(): RpcProviderName | null {
  return lastEthereumProvider;
}

function taggedHttp(provider: RpcProviderName, url: string, record: boolean): Transport {
  return ((parameters) => {
    const transport = http(url, { timeout: 12_000, retryCount: 0 })(parameters);
    const request = (async (body, options) => {
      const response = await transport.request(body, options);
      if (record) lastEthereumProvider = provider;
      return response;
    }) as typeof transport.request;
    return { ...transport, request };
  }) as Transport;
}

function ethereumTransport(endpoints: RpcEndpoint[], record: boolean) {
  return fallback(
    endpoints.map((endpoint) => taggedHttp(endpoint.provider, endpoint.url, record)),
    { retryCount: 0 },
  );
}

export function hemiRpcUrls(): string[] {
  return unique([process.env.HEMI_RPC_URL, PUBLIC_HEMI_RPC]);
}

export function rpcConfigured(): boolean {
  return ethRpcUrls().length > 0;
}

export function getRpcUrl(): string {
  const url = process.env.ETH_RPC_URL;
  if (!usableRpc(url)) throw new Error("ETH_RPC_URL is not set");
  return url;
}

function rpcTransport(urls: string[]) {
  return fallback(urls.map((url) => http(url, { timeout: 12_000, retryCount: 0 })), { retryCount: 0 });
}

let client: PublicClient | null = null;
let clientKey: string | null = null;

export function getPublicClient(): PublicClient {
  const endpoints = ethereumEndpoints();
  const key = endpoints.map((endpoint) => endpoint.url).join("|");
  if (!client || clientKey !== key) {
    client = createPublicClient({
      chain: mainnet,
      transport: ethereumTransport(endpoints, true),
    });
    clientKey = key;
  }
  return client;
}

/** Infura only. Null when INFURA_RPC_URL is unset. Used for gateway logs. */
export function getInfuraLogClient(): PublicClient | null {
  const infura = ethereumEndpoints().find((endpoint) => endpoint.provider === "infura");
  if (!infura) return null;
  return createPublicClient({
    chain: mainnet,
    transport: taggedHttp("infura", infura.url, false),
  });
}

/** ETH_RPC_URL, then the public node. Does not include Infura. */
export function getPublicLogClient(): PublicClient {
  const endpoints = ethereumEndpoints().filter((endpoint) => endpoint.provider === "public");
  return createPublicClient({
    chain: mainnet,
    transport: ethereumTransport(endpoints.length > 0 ? endpoints : ethereumEndpoints(), false),
  });
}

let hemiClient: PublicClient | null = null;
let hemiClientKey: string | null = null;

export function hemiRpcConfigured(): boolean {
  return hemiRpcUrls().length > 0;
}

export function getHemiClient(): PublicClient {
  const urls = hemiRpcUrls();
  const key = urls.join("|");
  if (!hemiClient || hemiClientKey !== key) {
    const hemi = defineChain({
      id: 43111,
      name: "Hemi",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [urls[0]] } },
      contracts: { multicall3: { address: MULTICALL3 } },
    });
    hemiClient = createPublicClient({
      chain: hemi,
      transport: rpcTransport(urls),
    });
    hemiClientKey = key;
  }
  return hemiClient;
}

export function actionsEnabled(): boolean {
  return process.env.ACTIONS_ENABLED === "true";
}

export function privateKeyPresent(): boolean {
  return Boolean(process.env.KEEPER_PRIVATE_KEY);
}

export function pegAlertBps(): number {
  const raw = process.env.PEG_ALERT_BPS;
  if (!raw) return DEFAULT_PEG_ALERT_BPS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new Error("PEG_ALERT_BPS must be an integer from 1 to 10000");
  }
  return parsed;
}

export function dripMaxVusd(): number {
  const raw = process.env.DRIP_MAX_VUSD;
  if (!raw) return DEFAULT_DRIP_MAX_VUSD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("DRIP_MAX_VUSD must be a positive number");
  }
  return parsed;
}
