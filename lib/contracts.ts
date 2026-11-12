import { getAddress, type Address } from "viem";

/** Ethereum mainnet addresses. Sources are noted per constant. */

/** docs.vetro.org/developers/deployed-addresses and vetro-contracts issue #111. */
export const VUSD = getAddress("0xCa83DDE9c22254f58e771bE5E157773212AcBAc3");
export const SVUSD = getAddress("0x476310E34D2810f7d79C43A74E4D79405bd7a925");
export const GATEWAY = getAddress("0xDaD503f8B9d42bb7af3AfC588358D30163e4416F");
export const TREASURY = getAddress("0xC8317A10385BE07901A4c9ee3d06E1D83AE378c9");
export const YIELD_DISTRIBUTOR = getAddress("0x55745265Ba172378cf45d224F09F0673cB470cef");

export const USDC = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
export const USDT = getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7");
export const FRXUSD = getAddress("0xCAcd6fd266aF91b8AeD52aCCc382b4e165586E29");
/** Read from the Curve VUSD/crvUSD pool coins(1). */
export const CRVUSD = getAddress("0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E");
/** Read from the Curve VUSD/msUSD pool coins(1). */
export const MSUSD = getAddress("0xab5eB14c09D416F0aC63661E57EDB7AEcDb9BEfA");
export const VETBTC = getAddress("0xf196C68233464A16CFDa319a47c21f4cECa62001");
/** ERC-4626 share of vetBTC. convertToAssets(1e18) is vetBTC per share. */
export const SVETBTC = getAddress("0x0cB9D84d4bcEc8d3D5B2d99a6F07f4605325987e");
/** vetBTC OFT on Hemi. Verified address; symbol vetBTC, 18 decimals. */
export const HEMI_VETBTC = getAddress("0xfF16E26B7fFCf24c378D57DF536dC5eC104a7dE4");
/** Hemi OFT-style shares. These are not ERC-4626 vaults; NAV is read on Ethereum. */
export const HEMI_SVUSD = getAddress("0xfe875CC86cC6BC2E93ab330D6b2c408C3Cd79710");
export const HEMI_SVETBTC = getAddress("0xD8D63De3b64bd06d99F8F5AD8B78Ed2fE7525eC0");
export const WBTC = getAddress("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599");
export const CBBTC = getAddress("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf");
/** Ethereum-side hemiBTC. docs.vetro.org vetBTC gateway collateral. */
export const HEMIBTC = getAddress("0x06ea695B91700071B161A434fED42D1DcbAD9f00");

/** Hemi chain. VUSD is the OFT from docs.vetro.org deployed addresses. */
export const HEMI_VUSD = getAddress("0xD3599AE62EE280709A22268a46d23164214e345B");
export const HEMI_USDC_E = getAddress("0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA");
export const HEMI_WETH = getAddress("0x4200000000000000000000000000000000000006");
export const HEMI_TOKEN = getAddress("0x99e3de3817f6081b2568208337ef83295b7f591d");
/** hemiBTC on Hemi, read from the BrownFi hemiBTC/VUSD pool. */
export const HEMI_BTC = getAddress("0xaa40c0c7644e0b2b224509571e10ad20d9c4ef28");
/** USDT on Hemi. token0 of BrownFi USDT/VUSD 0xf9368f1Fac81190d818BbC4d379Af65990F4c458. */
export const HEMI_USDT = getAddress("0xbB0D083fb1be0A9f6157ec484b6C79E0A4e31C2e");

/**
 * docs.vetro.org/liquidity-and-integrations/curve-pools
 * Epicenter of the 29 Oct 2026 dislocation.
 */
export const CURVE_VUSD_CRVUSD = getAddress("0xAFbA5800252530CE71b03Ba2BCa2Dd5aE44a7F3d");
export const CURVE_VUSD_MSUSD = getAddress("0x8bEA2a46D56c321A216F97Ab6b61C34098B819d2");
export const CURVE_FRXUSD_VUSD = getAddress("0xdE0576968C898bbE7bf13d79862F252c58443F96");
/** coins(0)=WBTC, coins(1)=svetBTC, verified on mainnet. */
export const CURVE_WBTC_SVETBTC = getAddress("0x90343fc2e9449e9Cd001Be955fad9727c815ec6D");

/** Chainlink USD aggregators on Ethereum. 8 decimals. */
export const CHAINLINK_BTC_USD = getAddress("0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c");
export const CHAINLINK_ETH_USD = getAddress("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");

/**
 * sVUSD/VUSD StableSwap. coins(0)=sVUSD, coins(1)=VUSD verified on mainnet.
 * Not listed on the docs Curve page (that page lists crvUSD/sVUSD). Kept because
 * the Oct 29 review measured sVUSD secondary price on this pool.
 */
export const CURVE_SVUSD_VUSD = getAddress("0xC4C5e8edB69100108C428E88329039b715E3AAd1");

/** docs.vetro.org/liquidity-and-integrations/sushi */
export const SUSHI_VUSD_USDT = getAddress("0x6C2bd2F9711f204E595D334c6B7B672851b7d699");

export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [VUSD.toLowerCase()]: { symbol: "VUSD", decimals: 18 },
  [SVUSD.toLowerCase()]: { symbol: "sVUSD", decimals: 18 },
  [USDC.toLowerCase()]: { symbol: "USDC", decimals: 6 },
  [USDT.toLowerCase()]: { symbol: "USDT", decimals: 6 },
  [FRXUSD.toLowerCase()]: { symbol: "frxUSD", decimals: 18 },
  [CRVUSD.toLowerCase()]: { symbol: "crvUSD", decimals: 18 },
  [MSUSD.toLowerCase()]: { symbol: "msUSD", decimals: 18 },
  [VETBTC.toLowerCase()]: { symbol: "vetBTC", decimals: 18 },
  [SVETBTC.toLowerCase()]: { symbol: "svetBTC", decimals: 18 },
  [HEMI_VETBTC.toLowerCase()]: { symbol: "vetBTC", decimals: 18 },
  [HEMI_SVUSD.toLowerCase()]: { symbol: "sVUSD", decimals: 18 },
  [HEMI_SVETBTC.toLowerCase()]: { symbol: "svetBTC", decimals: 18 },
  [WBTC.toLowerCase()]: { symbol: "WBTC", decimals: 8 },
  [CBBTC.toLowerCase()]: { symbol: "cbBTC", decimals: 8 },
  [HEMIBTC.toLowerCase()]: { symbol: "hemiBTC", decimals: 8 },
  [HEMI_VUSD.toLowerCase()]: { symbol: "VUSD", decimals: 18 },
  [HEMI_USDC_E.toLowerCase()]: { symbol: "USDC.e", decimals: 6 },
  [HEMI_WETH.toLowerCase()]: { symbol: "WETH", decimals: 18 },
  [HEMI_TOKEN.toLowerCase()]: { symbol: "HEMI", decimals: 18 },
  [HEMI_BTC.toLowerCase()]: { symbol: "hemiBTC", decimals: 8 },
  [HEMI_USDT.toLowerCase()]: { symbol: "USDT", decimals: 6 },
};

export function tokenMeta(address: Address): { symbol: string; decimals: number } {
  return (
    KNOWN_TOKENS[address.toLowerCase()] ?? {
      symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
      decimals: 18,
    }
  );
}

/** Curve StableSwap-NG. coins/balances are uint256; get_dy is int128. */
export const curvePoolAbi = [
  {
    type: "function",
    name: "coins",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "get_dy",
    stateMutability: "view",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "fee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** StableSwap-NG parameters used to reproduce get_dy off chain. */
export const stableSwapNgAbi = [
  ...curvePoolAbi,
  {
    type: "function",
    name: "A_precise",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "offpeg_fee_multiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "stored_rates",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

/** Twocrypto-NG. Same coin/balance getters, but get_dy takes uint256 indexes. */
export const curveCryptoAbi = [
  {
    type: "function",
    name: "coins",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "get_dy",
    stateMutability: "view",
    inputs: [
      { name: "i", type: "uint256" },
      { name: "j", type: "uint256" },
      { name: "dx", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** SushiSwap V3 and Uniswap V3. slot0 matches the Uniswap V3 layout. */
export const v3PoolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

/** Uniswap V3 tick table. `ticks` is decoded for the first two words only. */
export const v3TickAbi = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
  {
    type: "function",
    name: "fee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint24" }],
  },
  {
    type: "function",
    name: "tickSpacing",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int24" }],
  },
  {
    type: "function",
    name: "tickBitmap",
    stateMutability: "view",
    inputs: [{ name: "wordPosition", type: "int16" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ticks",
    stateMutability: "view",
    inputs: [{ name: "tick", type: "int24" }],
    outputs: [
      { name: "liquidityGross", type: "uint128" },
      { name: "liquidityNet", type: "int128" },
    ],
  },
] as const;

/** BrownFi tick table. The bitmap is indexed by the raw tick, not tick/tickSpacing. */
export const brownFiTickAbi = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
  {
    type: "function",
    name: "tickSpacing",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int24" }],
  },
  {
    type: "function",
    name: "tickTable",
    stateMutability: "view",
    inputs: [{ name: "wordPosition", type: "int16" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ticks",
    stateMutability: "view",
    inputs: [{ name: "tick", type: "int24" }],
    outputs: [
      { name: "liquidityGross", type: "uint128" },
      { name: "liquidityNet", type: "int128" },
    ],
  },
] as const;

/**
 * BrownFi globalState returns six words. The third word is the current swap fee
 * in Uniswap pips (500 = 0.05%).
 */
export const brownFiStateAbi = [
  {
    type: "function",
    name: "globalState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "fee", type: "uint16" },
      { name: "timepointIndex", type: "uint16" },
      { name: "communityFee", type: "uint16" },
      { name: "unlocked", type: "uint8" },
    ],
  },
] as const;

export const chainlinkAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/** BrownFi CLAMM on Hemi. globalState().price is a Q64.96 sqrt price, same scale as slot0. */
export const algebraPoolAbi = [
  {
    type: "function",
    name: "globalState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "fee", type: "uint16" },
      { name: "timepointIndex", type: "uint16" },
      { name: "communityFeeToken0", type: "uint8" },
      { name: "communityFeeToken1", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const erc4626Abi = [
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const yieldDistributorAbi = [
  {
    type: "function",
    name: "distribute",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount_", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pendingYield",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "rewardRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "periodFinish",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "yieldDuration",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lastUpdateTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const gatewayEvents = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "peggedTokenAmount", type: "uint256", indexed: false },
      { name: "receiver", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "peggedTokenAmount", type: "uint256", indexed: false },
      { name: "receiver", type: "address", indexed: true },
    ],
  },
] as const;

export const QUOTE_SIZE = 1000n;
export const DEFAULT_PEG_ALERT_BPS = 50;
export const DEFAULT_DRIP_MAX_VUSD = 1_000_000;
export const STATUS_CACHE_MS = 15_000;
export const GATEWAY_LOOKBACK_BLOCKS = 12_000;
export const GATEWAY_EVENT_LIMIT = 12;
