import { type Address } from "viem";
import {
  CBBTC,
  CRVUSD,
  FRXUSD,
  HEMI_BTC,
  HEMI_TOKEN,
  HEMI_USDC_E,
  HEMI_USDT,
  HEMI_VUSD,
  HEMI_WETH,
  HEMIBTC,
  MSUSD,
  SVUSD,
  USDT,
  SVETBTC,
  VETBTC,
  VUSD,
  WBTC,
} from "@/lib/contracts";

export type VenueChain = "ethereum" | "hemi";
export type VenueKind = "curve-stableswap" | "curve-crypto" | "v3" | "algebra";
/** par: quote per base versus 1. nav: quote per sVUSD versus ERC-4626 NAV. rate: cross-asset price, no peg band. */
export type VenueReference = "par" | "nav" | "rate";

/** Quote stablecoin whose own depeg can look like a VUSD premium. */
export type CounterpartyRisk = {
  symbol: string;
  coingeckoId: string;
  href: string;
};

export type Venue = {
  id: string;
  chain: VenueChain;
  label: string;
  pool: Address;
  base: Address;
  quote: Address;
  kind: VenueKind;
  reference: VenueReference;
  source: string;
  counterpartyRisk?: CounterpartyRisk;
  /** Pool page for trading. When omitted, the builder picks Curve, Uniswap, or BrownFi. */
  tradeUrl?: string;
};

/**
 * Every pool on app.vetro.org/en/liquidity.
 * Ethereum addresses come from docs.vetro.org, Uniswap V3 factory getPool, or on-chain coins().
 * Hemi addresses come from the BrownFi pools behind that page. TVL is not stored here.
 */
export const VENUES: readonly Venue[] = [
  {
    id: "curve-vusd-crvusd",
    chain: "ethereum",
    label: "Curve VUSD/crvUSD",
    pool: "0xAFbA5800252530CE71b03Ba2BCa2Dd5aE44a7F3d",
    base: VUSD,
    quote: CRVUSD,
    kind: "curve-stableswap",
    reference: "par",
    source: "docs.vetro.org/liquidity-and-integrations/curve-pools",
  },
  {
    id: "curve-frxusd-svusd",
    chain: "ethereum",
    label: "Curve frxUSD/sVUSD",
    pool: "0xf3EF7C2F7bff49EB6a7b4c7BF613a1c2Cb2a48e2",
    base: SVUSD,
    quote: FRXUSD,
    kind: "curve-stableswap",
    reference: "nav",
    source: "on-chain coins(): frxUSD, sVUSD",
  },
  {
    id: "sushi-vusd-usdt",
    chain: "ethereum",
    label: "Sushi VUSD/USDT",
    pool: "0x6C2bd2F9711f204E595D334c6B7B672851b7d699",
    base: VUSD,
    quote: USDT,
    kind: "v3",
    reference: "par",
    source: "docs.vetro.org/liquidity-and-integrations/sushi",
    tradeUrl: "https://www.sushi.com/ethereum/pool/v3/0x6C2bd2F9711f204E595D334c6B7B672851b7d699",
  },
  {
    id: "curve-vusd-msusd",
    chain: "ethereum",
    label: "Curve VUSD/msUSD",
    pool: "0x8bEA2a46D56c321A216F97Ab6b61C34098B819d2",
    base: VUSD,
    quote: MSUSD,
    kind: "curve-stableswap",
    reference: "par",
    source: "docs.vetro.org/liquidity-and-integrations/curve-pools",
    counterpartyRisk: {
      symbol: "msUSD",
      coingeckoId: "metronome-synth-usd",
      href: "https://www.coingecko.com/en/coins/metronome-synth-usd",
    },
  },
  {
    id: "uniswap-vusd-frxusd",
    chain: "ethereum",
    label: "Uniswap VUSD/frxUSD",
    pool: "0x410da528a866dC26A28a40bb5c0A458111f123F5",
    base: VUSD,
    quote: FRXUSD,
    kind: "v3",
    reference: "par",
    source: "Uniswap V3 factory getPool fee 100",
  },
  {
    id: "curve-svusd-vusd",
    chain: "ethereum",
    label: "Curve sVUSD/VUSD",
    pool: "0xC4C5e8edB69100108C428E88329039b715E3AAd1",
    base: SVUSD,
    quote: VUSD,
    kind: "curve-stableswap",
    reference: "nav",
    source: "on-chain coins(): sVUSD, VUSD",
  },
  {
    id: "uniswap-hemibtc-vetbtc",
    chain: "ethereum",
    label: "Uniswap hemiBTC/vetBTC",
    pool: "0x1335D0AeAE12eDf259B0Ffb9B475d0df99d0E83c",
    base: VETBTC,
    quote: HEMIBTC,
    kind: "v3",
    reference: "par",
    source: "Uniswap V3 factory getPool fee 500",
  },
  {
    id: "curve-vusd-hemibtc",
    chain: "ethereum",
    label: "Curve VUSD/hemiBTC",
    pool: "0xc4ff0e84ec219581092e5660c74a2da8de6aee4f",
    base: HEMIBTC,
    quote: VUSD,
    kind: "curve-crypto",
    reference: "rate",
    source: "docs.vetro.org/liquidity-and-integrations/curve-pools",
  },
  {
    id: "uniswap-wbtc-vetbtc",
    chain: "ethereum",
    label: "Uniswap WBTC/vetBTC",
    pool: "0x3467593228DBd4AcE9E44D58A193Cb5DC7A3efEc",
    base: VETBTC,
    quote: WBTC,
    kind: "v3",
    reference: "par",
    source: "Uniswap V3 factory getPool fee 500",
  },
  {
    id: "curve-crvusd-svusd",
    chain: "ethereum",
    label: "Curve crvUSD/sVUSD",
    pool: "0x659B7B5Dd7936BF2f2d198A87C1583049D1D91d3",
    base: SVUSD,
    quote: CRVUSD,
    kind: "curve-stableswap",
    reference: "nav",
    source: "docs.vetro.org/liquidity-and-integrations/curve-pools",
  },
  {
    id: "uniswap-cbbtc-vetbtc",
    chain: "ethereum",
    label: "Uniswap cbBTC/vetBTC",
    pool: "0x3656E05FcaCad70f2f12893CF7c215578B6f8580",
    base: VETBTC,
    quote: CBBTC,
    kind: "v3",
    reference: "par",
    source: "Uniswap V3 factory getPool fee 500",
  },
  {
    id: "curve-frxusd-vusd",
    chain: "ethereum",
    label: "Curve frxUSD/VUSD",
    pool: "0xdE0576968C898bbE7bf13d79862F252c58443F96",
    base: VUSD,
    quote: FRXUSD,
    kind: "curve-stableswap",
    reference: "par",
    source: "Vetro DEX addresses, 6 Nov 2026. On-chain coins(): frxUSD, VUSD.",
  },
  {
    id: "curve-wbtc-svetbtc",
    chain: "ethereum",
    label: "Curve WBTC/svetBTC",
    pool: "0x90343fc2e9449e9Cd001Be955fad9727c815ec6D",
    base: SVETBTC,
    quote: WBTC,
    kind: "curve-stableswap",
    reference: "nav",
    source: "Vetro DEX addresses, 6 Nov 2026. On-chain coins(): WBTC, svetBTC.",
  },
  {
    id: "curve-vetbtc-wbtc",
    chain: "ethereum",
    label: "Curve vetBTC/WBTC",
    pool: "0xf2e47b9bcb26463a12b1409be06fdaa1c308aa65",
    base: VETBTC,
    quote: WBTC,
    kind: "curve-stableswap",
    reference: "par",
    source: "docs.vetro.org/liquidity-and-integrations/curve-pools",
  },
  {
    id: "hemi-brownfi-hemibtc-vusd",
    chain: "hemi",
    label: "BrownFi hemiBTC/VUSD",
    pool: "0x7348524B8A45106885e415d33D200A4EC0a23fae",
    base: HEMI_BTC,
    quote: HEMI_VUSD,
    kind: "algebra",
    reference: "rate",
    source: "BrownFi CLAMM on Hemi",
  },
  {
    id: "hemi-brownfi-usdce-vusd",
    chain: "hemi",
    label: "BrownFi USDC.e/VUSD",
    pool: "0x51E2CB4E3b37254615f17f40b8a0595e1b26890e",
    base: HEMI_VUSD,
    quote: HEMI_USDC_E,
    kind: "algebra",
    reference: "par",
    source: "BrownFi CLAMM on Hemi",
  },
  {
    id: "hemi-brownfi-weth-vusd",
    chain: "hemi",
    label: "BrownFi WETH/VUSD",
    pool: "0x6153eF0ABFE8fA881A2492743dfc34ec594868D1",
    base: HEMI_WETH,
    quote: HEMI_VUSD,
    kind: "algebra",
    reference: "rate",
    source: "BrownFi CLAMM on Hemi",
  },
  {
    id: "hemi-brownfi-usdt-vusd",
    chain: "hemi",
    label: "BrownFi USDT/VUSD",
    pool: "0xf9368f1Fac81190d818BbC4d379Af65990F4c458",
    base: HEMI_VUSD,
    quote: HEMI_USDT,
    kind: "algebra",
    reference: "par",
    source: "BrownFi CLAMM on Hemi. Thin pool. USDT is token0 of this pool.",
  },
  {
    id: "hemi-brownfi-hemi-vusd",
    chain: "hemi",
    label: "BrownFi HEMI/VUSD",
    pool: "0x7e8b925b43dBb364DeF5E44e93E9f8fBc02cfC21",
    base: HEMI_TOKEN,
    quote: HEMI_VUSD,
    kind: "algebra",
    reference: "rate",
    source: "BrownFi CLAMM on Hemi",
  },
] as const;

export const ETHEREUM_VENUES = VENUES.filter((venue) => venue.chain === "ethereum");
export const HEMI_VENUES = VENUES.filter((venue) => venue.chain === "hemi");
