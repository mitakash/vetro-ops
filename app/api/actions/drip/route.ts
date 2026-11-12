import { connection } from "next/server";

export const maxDuration = 60;

/**
 * The public monitor never reads keeper state and never broadcasts.
 * Both methods fail closed so a host flag cannot arm a write.
 */
export async function GET() {
  await connection();
  return refused();
}

export async function POST() {
  await connection();
  return refused();
}

function refused(): Response {
  return Response.json(
    { ok: false, error: "This public monitor is read-only. Keeper actions are disabled." },
    { status: 403 },
  );
}
