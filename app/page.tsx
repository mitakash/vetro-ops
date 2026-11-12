import { Suspense } from "react";
import { connection } from "next/server";
import { PegMonitorView } from "@/components/peg-monitor";
import { getPegMonitor } from "@/lib/peg";

export const maxDuration = 60;

export default function Page() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Monitor />
    </Suspense>
  );
}

async function Monitor() {
  await connection();
  const data = await getPegMonitor();
  return <PegMonitorView data={data} />;
}
