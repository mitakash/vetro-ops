/** Strip RPC URLs and hex secrets before anything is logged or returned. */
export function publicError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Request failed";
  const first = raw.split("\n")[0] ?? "Request failed";
  return first
    .replace(/https?:\/\/\S+/gi, "[rpc]")
    .replace(/0x[a-fA-F0-9]{64,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 280);
}
