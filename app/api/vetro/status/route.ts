import { connection } from "next/server";
import { getPegMonitor } from "@/lib/peg";

export const maxDuration = 60;

export async function GET(request: Request) {
  await connection();
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  const status = await getPegMonitor({ fresh: fresh && authorized });
  return Response.json(status, {
    headers: {
      "cache-control": status.pending ? "no-store" : "public, max-age=60, s-maxage=60",
    },
  });
}
