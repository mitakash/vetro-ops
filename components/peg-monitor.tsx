"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  counterPerVetroWad,
  quoteExactInput,
  stableGetDy,
  stableMarginalWad,
  type ClPool,
  type PegAsset,
  type StablePoolState,
} from "@/lib/peg-math";
import type { ClSim, CurveSim, PegMonitor, PegRow } from "@/lib/peg-types";
import { deviationBps, exchangeWad, formatAmount, formatBps, formatPegPrice } from "@/lib/quote-math";

const PEGS: PegAsset[] = ["VUSD", "sVUSD", "vetBTC", "svetBTC"];

export function PegMonitorView({ data }: { data: PegMonitor }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Vetro peg monitor</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Public read-only prices for VUSD, sVUSD, vetBTC, and svetBTC. Each row is the pool&apos;s
            price of the Vetro token versus fair value, and the trade that would move that price back
            to fair. Snapshots refresh about once a minute.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>

      {data.error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Read failed</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}

      {data.alert.active ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Outside the {data.alert.thresholdBps} bp band</AlertTitle>
          <AlertDescription>{data.alert.reasons.join(" · ")}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Inside the {data.alert.thresholdBps} bp band</AlertTitle>
          <AlertDescription>
            No pool with a fair value is more than {data.alert.thresholdBps} bps away. A red number is a
            discount. A green number is a premium.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PEGS.map((peg) => (
          <WorstCard
            key={peg}
            peg={peg}
            worst={data.worst[peg]}
            fair={fairDetail(data, peg)}
            notices={data.rows.filter((row) => row.peg === peg && row.counterparty && row.excludeFromHeadline)}
          />
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        Ethereum {data.ethereumBlock ? `block ${Number(data.ethereumBlock.number).toLocaleString("en-US")} · ${formatUtc(data.ethereumBlock.timestamp)}` : "unread"}
        {data.ethereumProvider ? ` · via ${data.ethereumProvider}` : ""}
        {" · "}
        Hemi {data.hemiBlock ? `block ${Number(data.hemiBlock.number).toLocaleString("en-US")} · ${formatUtc(data.hemiBlock.timestamp)}` : "unread"}
        {" · "}
        BTC {data.fair.btcUsd ?? "—"} · ETH {data.fair.ethUsd ?? "—"} · snapshot {formatUtc(data.fetchedAt)}
      </p>

      {PEGS.map((peg) => (
        <TokenTable key={peg} peg={peg} rows={data.rows.filter((row) => row.peg === peg)} updated={data.fetchedAt} />
      ))}

      <HowCalculated />
    </div>
  );
}

function WorstCard({
  peg,
  worst,
  fair,
  notices,
}: {
  peg: PegAsset;
  worst: PegMonitor["worst"][PegAsset];
  fair: string;
  notices: PegRow[];
}) {
  const discount = worst.bps !== null && worst.bps < 0;
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{peg}</p>
      <p className={`mt-1 font-mono text-lg tabular-nums ${bpsClass(worst.bps)}`}>
        {worst.bps === null ? "—" : discount ? formatBps(worst.bps) : "No discount"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {worst.bps === null
          ? "No fair value yet"
          : discount
            ? `Worst discount · ${worst.venue}`
            : `Tightest ${formatBps(worst.bps ?? 0)} · ${worst.venue}`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{fair}</p>
      {notices.map((row) =>
        row.counterparty ? (
          <p key={row.id} className="mt-2 text-xs text-amber-300">
            <DepegCopy notice={row.counterparty} />
          </p>
        ) : null,
      )}
    </div>
  );
}

function TokenTable({ peg, rows, updated }: { peg: PegAsset; rows: PegRow[]; updated: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{peg}</CardTitle>
        <CardDescription>
          {rows.length} {rows.length === 1 ? "pool" : "pools"}. Price is {peg} in the paired asset.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venue</TableHead>
                <TableHead>Chain</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Pool price</TableHead>
                <TableHead>Fair value</TableHead>
                <TableHead>Premium / discount</TableHead>
                <TableHead>Trade to fair</TableHead>
                <TableHead>Depth</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Explorer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <PoolRows key={row.id} row={row} updated={updated} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PoolRows({ row, updated }: { row: PegRow; updated: string }) {
  return (
    <>
      <TableRow>
        <TableCell>
          <a
            className="font-medium underline-offset-2 hover:underline"
            href={row.tradeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {row.venue}
          </a>
          <div className="text-xs text-muted-foreground">
            {row.model}
            {row.feeLabel ? ` · ${row.feeLabel}` : ""}
          </div>
          {row.verified ? null : (
            <Badge variant="outline" className="mt-1">
              Unverified
            </Badge>
          )}
          {row.counterparty ? (
            <Badge variant="outline" className="mt-1 border-amber-400/40 text-amber-300">
              {row.counterparty.symbol} depeg
            </Badge>
          ) : null}
          {row.error ? <div className="mt-1 max-w-xs text-xs text-red-400">{row.error}</div> : null}
        </TableCell>
        <TableCell className="text-xs">{row.chain === "hemi" ? "Hemi" : "Ethereum"}</TableCell>
        <TableCell className="font-mono text-xs">{row.pair}</TableCell>
        <TableCell className="font-mono text-xs">
          {row.poolPrice ? (
            <>
              <div>
                {row.poolPrice} {row.counterSymbol}
              </div>
              {row.inversePrice ? (
                <div className="text-muted-foreground">
                  {row.inversePrice} {row.inverseUnit}
                </div>
              ) : null}
              {row.counterparty?.usdPrice ? (
                <div className="text-amber-300">{row.counterparty.symbol} {row.counterparty.usdPrice}</div>
              ) : null}
              {row.counterparty?.impliedUsd ? (
                <div className="text-amber-300">Implied {row.vetroSymbol} {row.counterparty.impliedUsd}</div>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {row.fairValue ? (
            <>
              <div>
                {row.fairValue} {row.counterSymbol}
              </div>
              {row.inverseFair ? (
                <div className="text-muted-foreground">
                  {row.inverseFair} {row.inverseUnit}
                </div>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell className={`font-mono text-xs ${bpsClass(row.premiumBps)}`}>
          {row.premiumBps === null ? "—" : formatBps(row.premiumBps)}
        </TableCell>
        <TableCell className="font-mono text-xs">
          <TradeCell row={row} />
        </TableCell>
        <TableCell className="max-w-56 font-mono text-xs text-muted-foreground">{row.depth ?? "—"}</TableCell>
        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatUtc(updated)}</TableCell>
        <TableCell>
          <a className="text-xs underline-offset-2 hover:underline" href={row.explorerUrl} target="_blank" rel="noopener noreferrer">
            {row.chain === "hemi" ? "Explorer" : "Etherscan"}
          </a>
        </TableCell>
      </TableRow>
      {row.sim ? (
        <TableRow>
          <TableCell colSpan={10} className="bg-muted/30">
            <WhatIf row={row} />
          </TableCell>
        </TableRow>
      ) : row.note ? (
        <TableRow>
          <TableCell colSpan={10} className="text-xs text-muted-foreground">
            {row.note}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function TradeCell({ row }: { row: PegRow }) {
  const verb = row.direction === "buy" ? "Buy" : "Sell";
  const size =
    row.tradeStatus === "at-fair"
      ? "At fair value"
      : row.tradeStatus === "n/a" || !row.tradeAmount || !row.tradeSymbol
        ? "size n/a"
        : `${verb} ${row.tradeAmount} ${row.tradeSymbol}${row.tradeUsd ? ` · ${row.tradeUsd}` : ""}`;
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        {size}{" "}
        <a
          className="text-xs underline underline-offset-2"
          href={row.tradeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Trade
        </a>
      </span>
      {row.averagePrice ? (
        <span className="text-muted-foreground">
          avg {row.averagePrice}
          {row.priceImpactBps !== null ? ` · impact ${formatBps(row.priceImpactBps)}` : ""}
        </span>
      ) : null}
      {row.tradeStatus === "insufficient" ? (
        <span className="text-red-400">
          Not enough depth
          {row.endPremiumBps !== null ? ` · ends ${formatBps(row.endPremiumBps)}` : ""}
        </span>
      ) : null}
      {row.counterparty ? (
        <span className="max-w-xs text-amber-300">
          <DepegCopy notice={row.counterparty} />
        </span>
      ) : null}
    </div>
  );
}

function DepegCopy({ notice }: { notice: NonNullable<PegRow["counterparty"]> }) {
  const lead =
    notice.tone === "above"
      ? `${notice.symbol} is trading above $1 — this pool's discount reflects ${notice.symbol}'s price, not VUSD.`
      : `${notice.symbol} is trading below $1 — this pool's premium reflects ${notice.symbol}'s depeg, not VUSD.`;
  return (
    <>
      {lead}{" "}
      <a href={notice.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        Check {notice.symbol} price before trading.
      </a>
    </>
  );
}

function WhatIf({ row }: { row: PegRow }) {
  const [side, setSide] = useState<"buy" | "sell">(row.direction ?? "sell");
  const [amount, setAmount] = useState("");
  const symbol = side === "sell" ? row.vetroSymbol : row.counterSymbol;
  const result = useMemo(() => describeTrade(row, side, amount), [row, side, amount]);
  const inputId = `what-if-${row.id}`;
  return (
    <form className="flex flex-col gap-2 px-1 py-1" onSubmit={(event) => event.preventDefault()}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${inputId}-side`}>
          What if I
          <select
            id={`${inputId}-side`}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
            value={side}
            onChange={(event) => setSide(event.target.value === "buy" ? "buy" : "sell")}
          >
            <option value="buy">buy {row.vetroSymbol}</option>
            <option value="sell">sell {row.vetroSymbol}</option>
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs text-muted-foreground" htmlFor={inputId}>
          Amount ({symbol})
          <Input
            id={inputId}
            inputMode="decimal"
            value={amount}
            placeholder="0.0"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {result ? `${result} Estimate only. This page cannot send a transaction.` : (row.note ?? "Estimate only. This page cannot send a transaction.")}
      </p>
    </form>
  );
}

function HowCalculated() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How this is calculated</CardTitle>
        <CardDescription>Read-only estimates. Nothing on this page can move funds.</CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-3xl flex-col gap-3 text-sm text-muted-foreground">
        <p>
          VUSD fair value is one dollar against USDC, USDT, USDC.e, frxUSD, and crvUSD. msUSD is not treated as a
          dollar while it trades more than 2% off $1; that pool&apos;s premium is the counterparty. sVUSD fair
          value is <span className="font-mono">convertToAssets(1e18)</span> VUSD. vetBTC fair value is one
          wrapped BTC (WBTC, cbBTC, or hemiBTC). svetBTC fair value is its <span className="font-mono">convertToAssets</span>{" "}
          price in vetBTC, and wrapped BTC is treated as one vetBTC.
        </p>
        <p>
          VUSD versus WETH or hemiBTC uses Chainlink ETH/USD or BTC/USD on Ethereum. HEMI has no reference
          price here, so that row shows the pool price only and leaves fair value and trade size blank.
        </p>
        <p>
          Curve StableSwap-NG, including sVUSD and svetBTC pools with stored rates, is reproduced from the
          on-chain amplification, fee, off-peg multiplier, balances, and rates. The pool price is a tiny{" "}
          <span className="font-mono">get_dy</span>, so it includes the fee. The trade size is a binary search
          until that marginal price is within about 1 bp of fair value. The average price is the execution
          price of that trade.
        </p>
        <p>
          Uniswap v3 and BrownFi prices are the mid from the current sqrt price. The trade walks initialized
          ticks from that price to the fair sqrt price and adds the swap fee to the input. BrownFi uses its
          tick table. The Curve VUSD/hemiBTC crypto pool shows the discount from a small swap; its trade size
          is left as n/a.
        </p>
        <p>A negative number is a discount and is shown in red. A positive number is a premium and is shown in green.</p>
      </CardContent>
    </Card>
  );
}

function describeTrade(row: PegRow, side: "buy" | "sell", amountText: string): string | null {
  const sim = row.sim;
  if (!sim) return null;
  const trimmed = amountText.trim();
  if (!trimmed) return null;
  const decimals = inputDecimals(sim, side);
  const raw = parseDecimal(trimmed, decimals);
  if (raw === null) return "Enter a positive amount with no more decimals than the token allows.";
  if (sim.kind === "curve") return describeCurve(sim, side, raw);
  return describeCl(sim, side, raw);
}

function describeCurve(sim: CurveSim, side: "buy" | "sell", amount: bigint): string {
  const state: StablePoolState = {
    balances: [BigInt(sim.balances[0]), BigInt(sim.balances[1])],
    rates: [BigInt(sim.rates[0]), BigInt(sim.rates[1])],
    ampPrecise: BigInt(sim.ampPrecise),
    fee: BigInt(sim.fee),
    offpegFeeMultiplier: BigInt(sim.offpegFeeMultiplier),
  };
  const inputIndex = side === "buy" ? sim.counterIndex : sim.vetroIndex;
  const outputIndex = side === "buy" ? sim.vetroIndex : sim.counterIndex;
  let dy: bigint;
  try {
    dy = stableGetDy(state, inputIndex, outputIndex, amount);
  } catch {
    return "That size cannot be quoted on this pool.";
  }
  if (dy <= 0n || dy >= state.balances[outputIndex]) return "That size is larger than the pool's other side.";
  const balances = state.balances.slice();
  balances[inputIndex] += amount;
  balances[outputIndex] -= dy;
  const end = stableMarginalWad(
    { ...state, balances },
    sim.vetroIndex,
    sim.counterIndex,
    sim.decimals[sim.vetroIndex],
    sim.decimals[sim.counterIndex],
  );
  const average =
    side === "sell"
      ? exchangeWad(dy, amount, sim.decimals[sim.vetroIndex], sim.decimals[sim.counterIndex])
      : exchangeWad(amount, dy, sim.decimals[sim.counterIndex], sim.decimals[sim.vetroIndex]);
  const outputSymbol = sim.symbols[outputIndex];
  const fair = sim.fairWad ? BigInt(sim.fairWad) : null;
  const bps = fair && end > 0n ? formatBps(deviationBps(end, fair)) : "n/a";
  return `Output ${formatAmount(dy, sim.decimals[outputIndex])} ${outputSymbol}. Average ${formatPegPrice(average)} ${sim.symbols[sim.counterIndex]} per ${sim.symbols[sim.vetroIndex]}. Resulting premium ${bps}.`;
}

function describeCl(sim: ClSim, side: "buy" | "sell", amount: bigint): string {
  const pool: ClPool = {
    sqrtPriceX96: BigInt(sim.sqrtPriceX96),
    tick: sim.tick,
    liquidity: BigInt(sim.liquidity),
    feePips: sim.feePips,
    tickSpacing: sim.tickSpacing,
    bitmap: new Map(sim.bitmap.map((word) => [word.word, BigInt(word.value)])),
    liquidityNet: new Map(sim.ticks.map((tick) => [tick.tick, BigInt(tick.liquidityNet)])),
  };
  const zeroForOne = side === "sell" ? sim.vetroIsToken0 : !sim.vetroIsToken0;
  const quote = quoteExactInput(pool, zeroForOne, amount);
  const vetroDecimals = sim.vetroIsToken0 ? sim.decimals0 : sim.decimals1;
  const counterDecimals = sim.vetroIsToken0 ? sim.decimals1 : sim.decimals0;
  const vetroSymbol = sim.vetroIsToken0 ? sim.symbol0 : sim.symbol1;
  const counterSymbol = sim.vetroIsToken0 ? sim.symbol1 : sim.symbol0;
  const outputDecimals = side === "sell" ? counterDecimals : vetroDecimals;
  const outputSymbol = side === "sell" ? counterSymbol : vetroSymbol;
  const end = counterPerVetroWad(quote.sqrtPriceX96, sim.decimals0, sim.decimals1, sim.vetroIsToken0);
  const average =
    side === "sell" && quote.amountOut > 0n
      ? exchangeWad(quote.amountOut, quote.amountIn, vetroDecimals, counterDecimals)
      : quote.amountOut > 0n
        ? exchangeWad(quote.amountIn, quote.amountOut, counterDecimals, vetroDecimals)
        : null;
  const fair = sim.fairWad ? BigInt(sim.fairWad) : null;
  const bps = fair && end > 0n ? formatBps(deviationBps(end, fair)) : "n/a";
  const partial = quote.insufficient ? " Loaded ticks cannot finish this size." : "";
  return `Output ${formatAmount(quote.amountOut, outputDecimals)} ${outputSymbol}. Average ${average ? formatPegPrice(average) : "—"} ${counterSymbol} per ${vetroSymbol}. Resulting premium ${bps}.${partial}`;
}

function inputDecimals(sim: CurveSim | ClSim, side: "buy" | "sell"): number {
  if (sim.kind === "curve") return sim.decimals[side === "buy" ? sim.counterIndex : sim.vetroIndex];
  const vetro = sim.vetroIsToken0 ? sim.decimals0 : sim.decimals1;
  const counter = sim.vetroIsToken0 ? sim.decimals1 : sim.decimals0;
  return side === "sell" ? vetro : counter;
}

function parseDecimal(input: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals) return null;
  try {
    return BigInt(whole + fraction.padEnd(decimals, "0"));
  } catch {
    return null;
  }
}

function fairDetail(data: PegMonitor, peg: PegAsset): string {
  if (peg === "sVUSD") return `NAV ${data.fair.svusdNav ?? "—"} VUSD`;
  if (peg === "svetBTC") return `NAV ${data.fair.svetbtcNav ?? "—"} vetBTC`;
  if (peg === "vetBTC") return `BTC ${data.fair.btcUsd ?? "—"}`;
  return "Fair value $1 vs stables";
}

function bpsClass(bps: number | null): string {
  if (bps === null || bps === 0) return "text-muted-foreground";
  return bps < 0 ? "text-red-400" : "text-emerald-400";
}

function formatUtc(iso: string): string {
  return iso.replace(".000Z", " UTC").replace("T", " ").replace("Z", " UTC");
}
