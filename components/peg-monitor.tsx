"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { type PegAsset } from "@/lib/peg-math";
import type { PegMonitor, PegRow } from "@/lib/peg-types";
import { formatDataAsOf, isSnapshotVeryStale, STALE_MS } from "@/lib/peg-freshness";
import { formatBps } from "@/lib/quote-math";
import { externalLinkLabel, linkPlace } from "@/lib/venue-links";
import { quoteWhatIf, sizePresets, type WhatIfResult } from "@/lib/what-if";

const PEGS: PegAsset[] = ["VUSD", "sVUSD", "vetBTC", "svetBTC"];

export function PegMonitorView({ data }: { data: PegMonitor }) {
  const router = useRouter();
  const showPrices = !data.pending && !(data.error && data.rows.length === 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Vetro peg monitor</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Public read-only prices for VUSD, sVUSD, vetBTC, and svetBTC. Each row is the pool&apos;s
            price of the Vetro token versus fair value, and the trade that would move that price back
            to fair. A saved snapshot is shown right away. A newer read runs in the background.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>

      {data.pending ? null : <DataAsOf fetchedAt={data.fetchedAt} />}

      {data.pending ? (
        <Alert>
          <AlertTitle>Prices are loading</AlertTitle>
          <AlertDescription>Refresh in a few seconds.</AlertDescription>
        </Alert>
      ) : data.error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Read failed</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}

      {showPrices ? (
        data.alert.active ? (
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
        )
      ) : null}

      {showPrices ? (
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
      ) : null}

      <p className="text-xs text-muted-foreground">
        Ethereum {data.ethereumBlock ? `block ${Number(data.ethereumBlock.number).toLocaleString("en-US")} · ${formatUtc(data.ethereumBlock.timestamp)}` : "unread"}
        {data.ethereumProvider ? ` · via ${data.ethereumProvider}` : ""}
        {" · "}
        Hemi {data.hemiBlock ? `block ${Number(data.hemiBlock.number).toLocaleString("en-US")} · ${formatUtc(data.hemiBlock.timestamp)}` : "unread"}
        {" · "}
        BTC {data.fair.btcUsd ?? "—"} · ETH {data.fair.ethUsd ?? "—"}
      </p>

      {showPrices
        ? PEGS.map((peg) => (
            <TokenTable key={peg} peg={peg} rows={data.rows.filter((row) => row.peg === peg)} updated={data.fetchedAt} />
          ))
        : null}

      <HowCalculated />
    </div>
  );
}

function DataAsOf({ fetchedAt }: { fetchedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const age = now - Date.parse(fetchedAt);
  return (
    <div className="flex flex-col gap-1" suppressHydrationWarning>
      <p className="flex flex-wrap items-center gap-2 text-sm" suppressHydrationWarning>
        <span>{formatDataAsOf(fetchedAt, now)}</span>
        {isSnapshotVeryStale(fetchedAt, now) ? (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
            Stale
          </span>
        ) : null}
      </p>
      {age > STALE_MS ? (
        <p className="text-xs text-muted-foreground">Refreshing in the background. Reload for the latest.</p>
      ) : null}
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
          <ExternalLink href={row.tradeUrl} label={externalLinkLabel(row.venue, linkPlace(row.tradeUrl))} className="font-medium">
            {row.venue}
          </ExternalLink>
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
          <ExternalLink
            href={row.explorerUrl}
            label={externalLinkLabel(row.venue, linkPlace(row.explorerUrl))}
            className="text-xs"
          >
            {row.chain === "hemi" ? "Explorer" : "Etherscan"}
          </ExternalLink>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={10} className="bg-muted/30">
          <WhatIf row={row} />
        </TableCell>
      </TableRow>
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
          href={row.tradeUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={externalLinkLabel(row.venue, linkPlace(row.tradeUrl))}
          aria-label={externalLinkLabel(row.venue, linkPlace(row.tradeUrl))}
          className="ml-1 inline-flex cursor-pointer items-center gap-0.5 rounded-full bg-[#2563eb] px-2 py-0.5 align-middle text-[11px] font-medium text-white no-underline hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]"
        >
          Trade
          <span aria-hidden="true">↗</span>
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

const externalLinkClass =
  "inline-flex cursor-pointer items-center gap-0.5 text-[#60a5fa] underline decoration-[#60a5fa] underline-offset-2 hover:text-[#93c5fd] hover:decoration-[#93c5fd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93c5fd]";

function ExternalLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className={className ? `${externalLinkClass} ${className}` : externalLinkClass}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
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
      <ExternalLink href={notice.href} label={externalLinkLabel(notice.symbol, "CoinGecko")}>
        Check {notice.symbol} price before trading.
      </ExternalLink>
    </>
  );
}

function blockedReason(row: PegRow): string | null {
  if (!row.sim) return row.note ?? row.error ?? "This pool cannot be simulated.";
  if (row.sim.kind === "cl" && row.sim.liquidity === "0") {
    return row.note ?? "No active liquidity in the current tick, so this pool cannot be quoted.";
  }
  if (!row.fairValue) return row.note ?? "No reference price for this pair, so this estimate is unavailable.";
  return null;
}

function WhatIf({ row }: { row: PegRow }) {
  const reason = blockedReason(row);
  const [side, setSide] = useState<"buy" | "sell">(row.direction ?? "sell");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const symbol = side === "sell" ? row.vetroSymbol : row.counterSymbol;
  const inputId = `what-if-${row.id}`;
  const presets = sizePresets({
    symbol,
    fairValue: row.fairValue,
    poolPrice: row.poolPrice,
    inputIsCounter: side === "buy",
  });
  const fairFill = row.direction && row.tradeAmount && (row.tradeStatus === "ok" || row.tradeStatus === "insufficient")
    ? { side: row.direction, amount: row.tradeAmount.replace(/,/g, "") }
    : null;

  function calculate(nextSide: "buy" | "sell", nextAmount: string) {
    if (!row.sim) return;
    const trimmed = nextAmount.trim();
    if (!trimmed) {
      setResult({ ok: false, message: "Enter an amount, then press Calculate." });
      return;
    }
    setResult(quoteWhatIf(row.sim, nextSide, trimmed));
  }

  return (
    <form
      className="flex flex-col gap-2 px-1 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        calculate(side, amount);
      }}
    >
      <fieldset disabled={reason !== null} className="flex flex-col gap-2 disabled:opacity-60">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${inputId}-side`}>
            What if I
            <select
              id={`${inputId}-side`}
              className="h-8 cursor-pointer rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
              value={side}
              onChange={(event) => {
                setSide(event.target.value === "buy" ? "buy" : "sell");
                setResult(null);
              }}
            >
              <option value="buy">buy {row.vetroSymbol}</option>
              <option value="sell">sell {row.vetroSymbol}</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-col gap-1 text-xs text-muted-foreground" htmlFor={inputId}>
            Amount ({symbol})
            <Input
              id={inputId}
              type="text"
              inputMode="decimal"
              value={amount}
              placeholder="0.0"
              onChange={(event) => {
                setAmount(event.target.value);
                setResult(null);
              }}
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-8 cursor-pointer items-center rounded-full bg-[#2563eb] px-3 text-sm font-medium text-white hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa] disabled:cursor-not-allowed"
          >
            Calculate
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!fairFill}
            title={fairFill ? "Prefill the trade that restores fair value" : "No trade-to-fair size for this pool"}
            className="cursor-pointer rounded-full border border-[#60a5fa]/60 px-2 py-0.5 text-xs text-[#60a5fa] hover:bg-[#60a5fa]/15 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              if (!fairFill) return;
              setSide(fairFill.side);
              setAmount(fairFill.amount);
              calculate(fairFill.side, fairFill.amount);
            }}
          >
            Trade to fair
          </button>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="cursor-pointer rounded-full border border-[#60a5fa]/60 px-2 py-0.5 text-xs text-[#60a5fa] hover:bg-[#60a5fa]/15"
              onClick={() => {
                setAmount(preset.amount);
                calculate(side, preset.amount);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>
      {reason ? (
        <p className="rounded-lg border border-foreground/15 bg-muted px-3 py-2 text-sm text-foreground">{reason}</p>
      ) : null}
      {!reason && result && !result.ok ? (
        <p className="text-sm text-red-400" role="alert">
          {result.message}
        </p>
      ) : null}
      {!reason && result?.ok ? <QuoteBox result={result} /> : null}
      <p className="text-xs text-muted-foreground">Estimate only. This page cannot send a transaction.</p>
    </form>
  );
}

function QuoteBox({ result }: { result: Extract<WhatIfResult, { ok: true }> }) {
  const after =
    result.endPremiumBps === null ? (
      "No fair value on this pool."
    ) : (
      <>
        {result.overshoots ? "Overshoots fair value." : "Does not overshoot fair value."} Resulting pool
        premium/discount <strong className="font-mono">{formatBps(result.endPremiumBps)}</strong>.
      </>
    );
  return (
    <div className="rounded-lg border border-[#60a5fa]/50 bg-[#60a5fa]/10 px-3 py-2 text-sm" role="status">
      <p>
        You pay <strong className="font-mono">{result.payAmount} {result.paySymbol}</strong>
      </p>
      <p>
        You receive <strong className="font-mono">{result.receiveAmount} {result.receiveSymbol}</strong>
      </p>
      <p>
        Average price <strong className="font-mono">{result.averagePrice}</strong> {result.averageUnit}
      </p>
      <p>
        Price impact <strong className="font-mono">{formatBps(result.priceImpactBps)}</strong>
      </p>
      <p>{after}</p>
      {result.partial ? <p>Loaded depth cannot finish this size. Amounts are the portion that fits.</p> : null}
    </div>
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
