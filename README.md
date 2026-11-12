# Vetro peg monitor

Public, read-only premiums and discounts for VUSD, sVUSD, vetBTC, and svetBTC on Ethereum and Hemi.

The page shows each pool's price against fair value, in basis points, and the trade that would move the marginal price back to fair value. It does not send transactions. Keeper drips are not reachable from this deployment, including when `ACTIONS_ENABLED` is set.

## Fair value

- VUSD is one dollar against USDC, USDT, USDC.e, frxUSD, and crvUSD. msUSD is flagged as a counterparty risk: when CoinGecko shows it more than 2% off $1, the Curve VUSD/msUSD premium is kept out of the VUSD headline. The row still shows msUSD's USD price, the implied VUSD price, and a link to CoinGecko. If that price request fails, the static warning remains.
- sVUSD is `convertToAssets(1e18)` VUSD.
- vetBTC is one wrapped BTC (WBTC, cbBTC, hemiBTC).
- svetBTC is `convertToAssets(1e18)` vetBTC. Wrapped BTC is treated as one vetBTC.
- VUSD versus WETH or hemiBTC uses Chainlink ETH/USD or BTC/USD. HEMI has no reference, so fair value and trade size stay blank.

Curve StableSwap-NG prices are a tiny `get_dy` (fee included), reproduced from on-chain A, fee, balances, and stored rates. Uniswap v3 and BrownFi prices are the sqrt-price mid. Trade size for those walks ticks. The Curve VUSD/hemiBTC crypto pool shows the discount only. Curve VUSD/msUSD carries a counterparty-depeg warning because msUSD (Metronome Synth USD) can trade away from $1; CoinGecko's public price is cached for five minutes and the fetch fails soft.

## Run

```bash
cp .env.example .env.local
npm install
npm test
npm run dev
```

`INFURA_RPC_URL`, `ETH_RPC_URL`, and `HEMI_RPC_URL` are server-only. They are never sent to the browser. The status payload and the page say `infura` or `public` for the Ethereum provider that answered. Pool rows are cached for 60 seconds so the public Hemi endpoint stays well under its rate limit. `npm test` checks the quote math, including StableSwap-NG vectors taken from mainnet.

Ethereum reads use viem `fallback()` in this order: `INFURA_RPC_URL`, then `ETH_RPC_URL`, then `https://ethereum-rpc.publicnode.com`. A failing or rate-limited Infura call moves to the next URL automatically.

Gateway `eth_getLogs` prefers Infura and may look back 50,000 blocks. If Infura is unset or that read fails, logs use the public RPC and stay within about 12,000 blocks, which is as far as `https://ethereum-rpc.publicnode.com` will serve.

When `HEMI_RPC_URL` is unset, reads use the public Hemi mainnet endpoint `https://rpc.hemi.network/rpc` (chain 43111, about 300 requests per minute). It is not a secret. That URL is the default in `lib/chain.ts` and in `.env.example`.

## HTTP

- `GET /` — server-rendered peg tables.
- `GET /api/vetro/status` — the same JSON. `?fresh=1` is ignored unless `Authorization: Bearer $CRON_SECRET` is set.
- `GET /api/health` — compact JSON. `actionsEnabled` is always false.
- `GET /api/cron/status` — daily at 13:00 UTC. Requires `CRON_SECRET` and fails closed when it is unset. It only reads.
- `GET` and `POST /api/actions/drip` — 403. The public monitor does not broadcast.

## Pools

Addresses live in `lib/venues.ts`. Ethereum Curve and Uniswap pools are the 6 Nov 2026 Vetro DEX list, plus the Sushi VUSD/USDT pool already verified in this repo. Hemi rows are the BrownFi pools already in that file. A pool that does not match its configured tokens stays on the page with an unverified flag.
