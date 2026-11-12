import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDecimalAmount, quoteWhatIf, sizePresets } from "./what-if.ts";
import type { ClSim, CurveSim } from "./peg-types.ts";
import { buildTradeUrl, explorerUrl, externalLinkLabel, linkPlace } from "./venue-links.ts";
import {
  counterpartyTone,
  excludeCounterpartyFromHeadline,
  impliedUsdPerTokenWad,
  usdPriceToWad,
} from "./counterparty.ts";
import { ethereumRpcPlan, gatewayLookbackBlocks, PUBLIC_ETH_RPC } from "./rpc-plan.ts";
import {
  amount0Delta,
  amount1Delta,
  fairCounterPerVetroWad,
  approximateTick,
  bitmapWord,
  counterPerVetroExecutionWad,
  getSqrtRatioAtTick,
  nextInitializedTick,
  quoteToSqrtPrice,
  stableGetDy,
  stableMarginalWad,
  targetSqrtPrice,
  tradeStableToFair,
  usdPerTokenWad,
  type ClPool,
  type StablePoolState,
} from "./peg-math.ts";
import {
  cappedQuoteAmount,
  deviationBps,
  exchangeWad,
  formatAmount,
  formatBps,
  formatUnits,
  invertWad,
  rewardPerDayRaw,
  v3Token1PerToken0Wad,
} from "./quote-math.ts";

describe("quote math", () => {
  it("prices the 2 Nov 2026 Sushi VUSD/USDT slot0 near par", () => {
    const sqrtPriceX96 = 79255871956851142014049n;
    const usdtPerVusd = v3Token1PerToken0Wad(sqrtPriceX96, 18, 6);
    assert.equal(usdtPerVusd, 1000699606990491445n);
    assert.equal(deviationBps(usdtPerVusd), 7);
  });

  it("converts a Curve get_dy into wad and basis points", () => {
    const dx = 1000n * 10n ** 18n;
    const dy = 1000452946693080426258n;
    const quote = exchangeWad(dy, dx, 18, 18);
    assert.equal(quote, 1000452946693080426n);
    assert.equal(deviationBps(quote), 5);
  });

  it("inverts a wad price", () => {
    const price = 2n * 10n ** 18n;
    assert.equal(invertWad(price), 5n * 10n ** 17n);
  });

  it("formats supply and signed bps", () => {
    assert.equal(formatUnits(777110094363291987028907n, 18, 2), "777,110.09");
    assert.equal(formatBps(-57), "-57 bps");
    assert.equal(formatBps(5), "+5 bps");
  });

  it("caps a thin-pool quote at one percent of balance", () => {
    const thin = 100n * 10n ** 18n;
    assert.equal(cappedQuoteAmount(thin, 18, 1000n), 10n ** 18n);
    const deep = 275_000n * 10n ** 18n;
    assert.equal(cappedQuoteAmount(deep, 18, 1000n), 1000n * 10n ** 18n);
    const dustBtc = 32_000_000_000_000_000n;
    assert.equal(cappedQuoteAmount(dustBtc, 18, 1000n), dustBtc / 100n);
  });

  it("matches mainnet StableSwap-NG get_dy, including stored rates and the dynamic fee", () => {
    const vusdCrv: StablePoolState = {
      balances: [252887074015508857582685n, 316713525559366337780436n],
      rates: [10n ** 18n, 10n ** 18n],
      ampPrecise: 10_000n,
      fee: 1_000_000n,
      offpegFeeMultiplier: 125_000_000_000n,
    };
    assert.equal(stableGetDy(vusdCrv, 0, 1, 10n ** 18n), 1002175847417425370n);

    const frxSvusd: StablePoolState = {
      balances: [124968970776920508455566n, 129957262223022450576873n],
      rates: [10n ** 18n, 1031552248685666831n],
      ampPrecise: 10_000n,
      fee: 10_000_000n,
      offpegFeeMultiplier: 50_000_000_000n,
    };
    assert.equal(stableGetDy(frxSvusd, 0, 1, 10n ** 18n), 969117153986517392n);

    const vetBtc: StablePoolState = {
      balances: [32192967823901407n, 1304705n],
      rates: [10n ** 18n, 10n ** 28n],
      ampPrecise: 30_000n,
      fee: 500_000n,
      offpegFeeMultiplier: 300_000_000_000n,
    };
    assert.equal(stableGetDy(vetBtc, 0, 1, 10n ** 18n), 1303881n);
  });

  it("buys the cheap coin until the marginal StableSwap price is within 1 bp of fair", () => {
    const state: StablePoolState = {
      balances: [2_000_000n * 10n ** 18n, 1_000_000n * 10n ** 18n],
      rates: [10n ** 18n, 10n ** 18n],
      ampPrecise: 10_000n,
      fee: 1_000_000n,
      offpegFeeMultiplier: 10n ** 10n,
    };
    const spot = stableMarginalWad(state, 0, 1, 18, 18);
    assert.ok(spot < 10n ** 18n);
    const trade = tradeStableToFair(state, 0, 1, 18, 18, 10n ** 18n);
    assert.equal(trade.status, "ok");
    assert.equal(trade.direction, "buy");
    assert.ok(trade.amountIn > 0n);
    assert.ok(trade.endPriceWad !== null && Math.abs(deviationBps(trade.endPriceWad, 10n ** 18n)) <= 1);
    assert.ok(trade.averageWad !== null && trade.averageWad < 10n ** 18n);
  });

  it("prices Uniswap v3 ticks and the input that moves sqrt price", () => {
    assert.equal(getSqrtRatioAtTick(0), 2n ** 96n);
    const tick1 = v3Token1PerToken0Wad(getSqrtRatioAtTick(1), 18, 18);
    assert.ok(tick1 > 1_000_05n * 10n ** 13n && tick1 < 1_000_15n * 10n ** 13n);

    const sqrtA = 2n ** 96n;
    const sqrtB = 2n * 2n ** 96n;
    const liquidity = 2n ** 96n;
    assert.equal(amount1Delta(sqrtA, sqrtB, liquidity, false), 2n ** 96n);
    assert.equal(amount0Delta(sqrtA, sqrtB, liquidity, false), 2n ** 95n);

    const bitmap = new Map<number, bigint>([
      [-1, 1n << 255n],
      [0, 1n << 5n],
    ]);
    assert.equal(nextInitializedTick(bitmap, 10, 1, true).tick, 5);
    assert.equal(nextInitializedTick(bitmap, 0, 1, false).tick, 5);
    assert.equal(nextInitializedTick(bitmap, -1, 1, true).tick, -1);

    const pool: ClPool = {
      sqrtPriceX96: sqrtA,
      tick: 0,
      liquidity,
      feePips: 0,
      tickSpacing: 1,
      bitmap: new Map([[0, 0n], [8, 0n]]),
      liquidityNet: new Map(),
    };
    const limit = targetSqrtPrice({ fairWad: 10015n * 10n ** 14n, decimals0: 18, decimals1: 18, vetroIsToken0: true });
    const quote = quoteToSqrtPrice(pool, limit);
    assert.equal(quote.zeroForOne, false);
    assert.equal(quote.insufficient, false);
    assert.ok(quote.amountIn > 0n);
    assert.equal(quote.amountIn, amount1Delta(sqrtA, limit, liquidity, true));
  });

  it("defines fair value for stables, ERC-4626 nav, and BTC or ETH references", () => {
    const nav = 1031552248685666831n;
    const share = 1009447951945499936n;
    const btc = 74_265n * 10n ** 18n;
    const eth = 2_068n * 10n ** 18n;
    assert.equal(fairCounterPerVetroWad({ peg: "VUSD", counterSymbol: "USDC", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), 10n ** 18n);
    assert.equal(fairCounterPerVetroWad({ peg: "sVUSD", counterSymbol: "VUSD", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), nav);
    assert.equal(fairCounterPerVetroWad({ peg: "sVUSD", counterSymbol: "frxUSD", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), nav);
    assert.equal(fairCounterPerVetroWad({ peg: "vetBTC", counterSymbol: "WBTC", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), 10n ** 18n);
    assert.equal(fairCounterPerVetroWad({ peg: "svetBTC", counterSymbol: "WBTC", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), share);
    assert.equal(fairCounterPerVetroWad({ peg: "VUSD", counterSymbol: "hemiBTC", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), invertWad(btc));
    assert.equal(fairCounterPerVetroWad({ peg: "VUSD", counterSymbol: "WETH", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), invertWad(eth));
    assert.equal(fairCounterPerVetroWad({ peg: "VUSD", counterSymbol: "HEMI", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), null);
    assert.equal(usdPerTokenWad({ symbol: "svetBTC", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), (share * btc) / 10n ** 18n);
    assert.equal(usdPerTokenWad({ symbol: "HEMI", svusdNav: nav, svetbtcNav: share, btcUsdWad: btc, ethUsdWad: eth }), null);
  });

  it("tries Infura before ETH_RPC_URL and the public node", () => {
    const infura = "https://mainnet.infura.io/v3/test-key";
    const plan = ethereumRpcPlan({ infuraUrl: infura, ethUrl: PUBLIC_ETH_RPC });
    assert.deepEqual(
      plan.map((endpoint) => endpoint.provider),
      ["infura", "public"],
    );
    assert.equal(plan[0]?.url, infura);
    assert.equal(plan[1]?.url, PUBLIC_ETH_RPC);

    const keyed = ethereumRpcPlan({
      infuraUrl: infura,
      ethUrl: "https://eth.example/rpc",
    });
    assert.deepEqual(
      keyed.map((endpoint) => endpoint.provider),
      ["infura", "public", "public"],
    );
    assert.equal(keyed[2]?.url, PUBLIC_ETH_RPC);

    const onlyPublic = ethereumRpcPlan({});
    assert.deepEqual(onlyPublic, [{ provider: "public", url: PUBLIC_ETH_RPC }]);
    assert.equal(gatewayLookbackBlocks("public"), 12_000);
    assert.equal(gatewayLookbackBlocks("infura"), 50_000);
  });

  it("builds a trade page for each venue and keeps explorer links", () => {
    const curve = "0xAFbA5800252530CE71b03Ba2BCa2Dd5aE44a7F3d";
    assert.equal(
      buildTradeUrl({ chain: "ethereum", kind: "curve-stableswap", pool: curve }),
      `https://www.curve.finance/dex/ethereum/pools/${curve}/swap`,
    );
    assert.equal(
      buildTradeUrl({ chain: "ethereum", kind: "curve-crypto", pool: "not-an-address" }),
      "https://www.curve.finance/dex/ethereum/pools?search=not-an-address",
    );
    const uni = "0x410da528a866dC26A28a40bb5c0A458111f123F5";
    assert.equal(
      buildTradeUrl({ chain: "ethereum", kind: "v3", pool: uni }),
      `https://app.uniswap.org/explore/pools/ethereum/${uni}`,
    );
    const sushi = "https://www.sushi.com/ethereum/pool/v3/0x6C2bd2F9711f204E595D334c6B7B672851b7d699";
    assert.equal(
      buildTradeUrl({ chain: "ethereum", kind: "v3", pool: "0x6C2bd2F9711f204E595D334c6B7B672851b7d699", tradeUrl: sushi }),
      sushi,
    );
    const brown = "0x7348524B8A45106885e415d33D200A4EC0a23fae";
    assert.equal(
      buildTradeUrl({ chain: "hemi", kind: "algebra", pool: brown }),
      `https://app.brownfi.io/clamm/pool/${brown}`,
    );
    assert.equal(explorerUrl("ethereum", curve), `https://etherscan.io/address/${curve}`);
    assert.equal(explorerUrl("hemi", brown), `https://explorer.hemi.xyz/address/${brown}`);
    assert.equal(linkPlace(`https://www.curve.finance/dex/ethereum/pools/${curve}/swap`), "Curve");
    assert.equal(linkPlace(sushi), "Sushi");
    assert.equal(linkPlace(`https://app.brownfi.io/clamm/pool/${brown}`), "BrownFi");
    assert.equal(
      externalLinkLabel("Curve VUSD/crvUSD", "Curve"),
      "Open Curve VUSD/crvUSD on Curve (new tab)",
    );
  });

  it("treats an msUSD depeg as the counterparty, not a VUSD premium", () => {
    const msUsd = usdPriceToWad(0.8);
    assert.ok(msUsd);
    const pool = 1_234_000_000_000_000_000n;
    assert.equal(impliedUsdPerTokenWad(pool, msUsd), 987_200_000_000_000_000n);
    assert.equal(counterpartyTone(msUsd), "below");
    assert.equal(excludeCounterpartyFromHeadline(msUsd), true);
    const near = usdPriceToWad(0.985);
    assert.ok(near);
    assert.equal(counterpartyTone(near), "below");
    assert.equal(excludeCounterpartyFromHeadline(near), false);
    assert.equal(counterpartyTone(10n ** 18n), null);
    assert.equal(excludeCounterpartyFromHeadline(10n ** 18n), false);
    assert.equal(counterpartyTone(null), "unknown");
    assert.equal(excludeCounterpartyFromHeadline(null), true);
    const rich = usdPriceToWad(1.03);
    assert.ok(rich);
    assert.equal(counterpartyTone(rich), "above");
    assert.equal(excludeCounterpartyFromHeadline(rich), true);
  });

  it("keeps the average price near par when buying a 6-decimal stable for an 18-decimal token", () => {
    const usdc = 10_527_660_000n;
    const vusd = 10_540n * 10n ** 18n;
    const bought = counterPerVetroExecutionWad({
      counterAmount: usdc,
      vetroAmount: vusd,
      vetroDecimals: 18,
      counterDecimals: 6,
    });
    assert.ok(bought > 998_800_000_000_000_000n && bought < 998_900_000_000_000_000n);
    const swappedDecimals = exchangeWad(usdc, vusd, 6, 18);
    assert.ok(swappedDecimals < 10n ** 12n);

    const quoted = (decimals0: number, decimals1: number, vetroIsToken0: boolean) => {
      const spot = 990_000_000_000_000_000n;
      const fair = 10n ** 18n;
      const sqrt = targetSqrtPrice({ fairWad: spot, decimals0, decimals1, vetroIsToken0 });
      const limit = targetSqrtPrice({ fairWad: fair, decimals0, decimals1, vetroIsToken0 });
      const tick = approximateTick(sqrt);
      const word = bitmapWord(tick, 1);
      const quote = quoteToSqrtPrice(
        {
          sqrtPriceX96: sqrt,
          tick,
          liquidity: 10n ** 24n,
          feePips: 100,
          tickSpacing: 1,
          bitmap: new Map([
            [word - 1, 0n],
            [word, 0n],
            [word + 1, 0n],
          ]),
          liquidityNet: new Map(),
        },
        limit,
      );
      const selling = quote.zeroForOne === vetroIsToken0;
      const average = counterPerVetroExecutionWad({
        counterAmount: selling ? quote.amountOut : quote.amountIn,
        vetroAmount: selling ? quote.amountIn : quote.amountOut,
        vetroDecimals: vetroIsToken0 ? decimals0 : decimals1,
        counterDecimals: vetroIsToken0 ? decimals1 : decimals0,
      });
      return { quote, average, selling };
    };

    const usdcIsToken0 = quoted(6, 18, false);
    const usdcIsToken1 = quoted(18, 6, true);
    for (const result of [usdcIsToken0, usdcIsToken1]) {
      assert.equal(result.selling, false);
      assert.equal(result.quote.insufficient, false);
      assert.ok(result.quote.amountIn > 0n);
      assert.ok(Math.abs(deviationBps(result.average, 990_000_000_000_000_000n)) < 100);
    }
  });

  it("quotes a 6-decimal buy near par in either token order", () => {
    const spot = 990_000_000_000_000_000n;
    const fair = (10n ** 18n).toString();
    const simFor = (decimals0: number, decimals1: number, vetroIsToken0: boolean): ClSim => {
      const sqrt = targetSqrtPrice({ fairWad: spot, decimals0, decimals1, vetroIsToken0 });
      const tick = approximateTick(sqrt);
      const word = bitmapWord(tick, 1);
      return {
        kind: "cl",
        sqrtPriceX96: sqrt.toString(),
        tick,
        liquidity: (10n ** 24n).toString(),
        feePips: 100,
        tickSpacing: 1,
        decimals0,
        decimals1,
        symbol0: vetroIsToken0 ? "VUSD" : "USDC",
        symbol1: vetroIsToken0 ? "USDC" : "VUSD",
        vetroIsToken0,
        fairWad: fair,
        bitmap: [
          { word: word - 1, value: "0" },
          { word, value: "0" },
          { word: word + 1, value: "0" },
        ],
        ticks: [],
      };
    };
    for (const sim of [simFor(6, 18, false), simFor(18, 6, true)]) {
      const result = quoteWhatIf(sim, "buy", "1000");
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.paySymbol, "USDC");
      assert.equal(result.receiveSymbol, "VUSD");
      assert.ok(result.averagePrice.startsWith("0.99"));
      assert.ok(Math.abs(result.priceImpactBps) < 100);
      assert.equal(result.overshoots, false);
    }

    const curve: CurveSim = {
      kind: "curve",
      balances: [(10n * 10n ** 18n).toString(), (10n * 10n ** 8n).toString()],
      rates: [(10n ** 18n).toString(), (10n ** 28n).toString()],
      ampPrecise: (500n * 100n).toString(),
      fee: "4000000",
      offpegFeeMultiplier: (10n ** 10n).toString(),
      decimals: [18, 8],
      symbols: ["vetBTC", "WBTC"],
      vetroIndex: 0,
      counterIndex: 1,
      fairWad: fair,
    };
    const btcBuy = quoteWhatIf(curve, "buy", "0.1");
    assert.equal(btcBuy.ok, true);
    if (!btcBuy.ok) return;
    assert.equal(btcBuy.paySymbol, "WBTC");
    assert.ok(btcBuy.averagePrice.startsWith("0.99") || btcBuy.averagePrice.startsWith("1.00"));
    assert.ok(!btcBuy.averagePrice.startsWith("0.000"));
    const tooBig = quoteWhatIf(curve, "buy", "1000");
    assert.equal(tooBig.ok, false);
    if (tooBig.ok) return;
    assert.match(tooBig.message, /larger than this pool's vetBTC/);
    const bad = quoteWhatIf(curve, "buy", "1.000000000");
    assert.equal(bad.ok, false);
    assert.equal(parseDecimalAmount("0", 6), null);
    assert.equal(parseDecimalAmount(formatAmount(973568n, 8), 8), 973568n);
    assert.deepEqual(
      sizePresets({ symbol: "WBTC", fairValue: null, poolPrice: null, inputIsCounter: true }).map((chip) => chip.amount),
      ["1", "10", "100"],
    );
    assert.deepEqual(
      sizePresets({ symbol: "USDC.e", fairValue: null, poolPrice: null, inputIsCounter: true }).map((chip) => chip.label),
      ["$1K", "$10K", "$100K"],
    );
  });

  it("turns a 7-day reward rate into a daily amount", () => {
    const amount = 1000n * 10n ** 18n;
    const duration = 7n * 86_400n;
    const rewardRate = (amount * 10n ** 18n) / duration;
    const perDay = rewardPerDayRaw(rewardRate);
    assert.equal(formatUnits(perDay, 18, 2), "142.85");
  });
});
