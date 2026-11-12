import { connection } from "next/server";
import { publicError } from "@/lib/errors";
import { getPegMonitor, pegSummary } from "@/lib/peg";

export const maxDuration = 60;

export async function GET() {
  await connection();
  try {
    const status = await getPegMonitor();
    const summary = pegSummary(status);
    return Response.json({
      service: "vetro-ops",
      readOnly: true,
      actionsEnabled: false,
      ...summary,
    });
  } catch (error) {
    return Response.json(
      { ok: false, service: "vetro-ops", readOnly: true, actionsEnabled: false, error: publicError(error) },
      { status: 502 },
    );
  }
}
