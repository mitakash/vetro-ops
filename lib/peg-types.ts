import type { PegAsset } from "@/lib/peg-math";
import type { RpcProviderName } from "@/lib/rpc-plan";
import type { VenueChain } from "@/lib/venues";

export type CurveSim = {
  kind: "curve";
  balances: [string, string];
  rates: [string, string];
  ampPrecise: string;
  fee: string;
  offpegFeeMultiplier: string;
  /** Decimals of coin 0 and coin 1, in pool index order. */
  decimals: [number, number];
  symbols: [string, string];
  vetroIndex: 0 | 1;
  counterIndex: 0 | 1;
  fairWad: string | null;
};

export type ClSim = {
  kind: "cl";
  sqrtPriceX96: string;
  tick: number;
  liquidity: string;
  feePips: number;
  tickSpacing: number;
  decimals0: number;
  decimals1: number;
  symbol0: string;
  symbol1: string;
  vetroIsToken0: boolean;
  fairWad: string | null;
  bitmap: { word: number; value: string }[];
  ticks: { tick: number; liquidityNet: string }[];
};

export type PoolSim = CurveSim | ClSim;

export type TradeStatus = "ok" | "at-fair" | "insufficient" | "n/a";

export type PegRow = {
  id: string;
  peg: PegAsset;
  chain: VenueChain;
  venue: string;
  pair: string;
  pool: string;
  explorerUrl: string;
  tradeUrl: string;
  verified: boolean;
  ok: boolean;
  model: string;
  feeLabel: string | null;
  poolPrice: string | null;
  fairValue: string | null;
  /** Counter units per one Vetro token, when that quote is easier to read inverted. */
  inversePrice: string | null;
  inverseFair: string | null;
  inverseUnit: string | null;
  premiumBps: number | null;
  direction: "buy" | "sell" | null;
  tradeAmount: string | null;
  tradeSymbol: string | null;
  tradeUsd: string | null;
  averagePrice: string | null;
  priceImpactBps: number | null;
  endPremiumBps: number | null;
  tradeStatus: TradeStatus;
  depth: string | null;
  tvlUsd: string | null;
  vetroSymbol: string;
  counterSymbol: string;
  error: string | null;
  note: string | null;
  sim: PoolSim | null;
  /** Quote stable is off $1, so this row must not set the headline VUSD band. */
  excludeFromHeadline: boolean;
  counterparty: {
    symbol: string;
    tone: "below" | "above" | "unknown";
    href: string;
    usdPrice: string | null;
    impliedUsd: string | null;
  } | null;
};

export type PegFair = {
  svusdNav: string | null;
  svetbtcNav: string | null;
  btcUsd: string | null;
  ethUsd: string | null;
};

export type PegBlock = {
  number: string;
  timestamp: string;
};

export type WorstDiscount = {
  bps: number | null;
  venue: string | null;
};

export type GatewayLogSummary = {
  provider: RpcProviderName;
  lookbackBlocks: number;
  fromBlock: string | null;
  toBlock: string | null;
  eventCount: number;
  error: string | null;
};

export type PegMonitor = {
  ok: boolean;
  fetchedAt: string;
  cached: boolean;
  /** True when this snapshot is older than five minutes. */
  stale: boolean;
  /** True when no snapshot exists yet and the first read is still running. */
  pending: boolean;
  /** Ethereum provider that served the peg reads. Never an RPC URL. */
  ethereumProvider: RpcProviderName | null;
  gatewayLogs: GatewayLogSummary | null;
  ethereumBlock: PegBlock | null;
  hemiBlock: PegBlock | null;
  fair: PegFair;
  worst: Record<PegAsset, WorstDiscount>;
  alert: {
    active: boolean;
    thresholdBps: number;
    reasons: string[];
  };
  rows: PegRow[];
  error: string | null;
};
