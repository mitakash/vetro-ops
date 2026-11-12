import { connection } from "next/server";
import { publicError } from "@/lib/errors";
import { getPegMonitor, pegSummary } from "@/lib/peg";

export const maxDuration = 60;

/**
 * Daily Vercel cron target (13:00 UTC). Reads the peg monitor and returns it.
 * Nothing is written. CRON_SECRET is required even outside production.
 */
export async function GET(request: Request) {
  await connection();
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const status = await getPegMonitor({ fresh: true });
    const summary = pegSummary(status);
    const worst = Object.entries(summary.worst)
      .map(([token, row]) => `${token}:${row.bps ?? "na"}`)
      .join(",");
    console.info(
      `vetro-ops cron alert=${summary.alert.active} worst=${worst} eth=${summary.ethereumBlock?.number ?? "none"}`,
    );
    return Response.json({ ...summary, persisted: false });
  } catch (error) {
    console.info(`vetro-ops cron failed: ${publicError(error)}`);
    return Response.json({ ok: false, error: publicError(error), persisted: false }, { status: 502 });
  }
}

function authorizeCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
