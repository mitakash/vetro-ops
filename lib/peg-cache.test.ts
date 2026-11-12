import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSnapshotGate, type SnapshotRecord } from "./peg-cache.ts";
import { formatDataAsOf, isSnapshotStale, isSnapshotVeryStale, isUsableSnapshot } from "./peg-freshness.ts";

type Sample = SnapshotRecord & { label: string };

function sample(fetchedAt: string, label = "prices"): Sample {
  return { fetchedAt, ok: true, rows: [{ label }], error: null, label };
}

describe("peg snapshot freshness", () => {
  it("formats the snapshot time in Eastern Time", () => {
    const fetchedAt = "2026-11-12T12:02:00.000Z";
    const now = Date.parse("2026-11-12T12:05:30.000Z");
    assert.equal(formatDataAsOf(fetchedAt, now), "Data as of 7:02 AM ET (3 min ago)");
    assert.equal(isSnapshotStale(fetchedAt, now), false);
    assert.equal(isSnapshotVeryStale(fetchedAt, Date.parse("2026-11-12T12:40:00.000Z")), true);
    assert.equal(isUsableSnapshot({ ok: false, rows: [], error: "timeout" }), false);
  });

  it("does not start a chain read when the snapshot is still fresh", async () => {
    let calls = 0;
    const gate = createSnapshotGate<Sample>({
      load: async () => {
        calls += 1;
        return sample("2026-11-12T12:00:30.000Z");
      },
      read: async () => sample("2026-11-12T12:00:00.000Z"),
      write: async () => undefined,
      now: () => Date.parse("2026-11-12T12:00:30.000Z"),
    });
    const result = await gate.get("cached");
    assert.equal(result.state, "ready");
    assert.equal(calls, 0);
  });

  it("serves a saved snapshot without waiting for a refresh", async () => {
    const saved = sample("2026-11-12T11:00:00.000Z");
    let store: Sample | null = saved;
    let reads = 0;
    const started = Date.now();
    const gate = createSnapshotGate<Sample>({
      load: () => new Promise(() => undefined),
      read: async () => {
        reads += 1;
        return store;
      },
      write: async (snapshot) => {
        store = snapshot;
      },
      now: () => Date.parse("2026-11-12T11:10:00.000Z"),
      coldStartMs: 5_000,
    });
    const result = await gate.get("cached");
    assert.equal(result.state, "ready");
    if (result.state !== "ready") return;
    assert.equal(result.fromCache, true);
    assert.equal(result.snapshot.label, "prices");
    assert.ok(Date.now() - started < 500);
    assert.equal(reads, 1);
  });

  it("shares one refresh across concurrent cold starts", async () => {
    let calls = 0;
    const gate = createSnapshotGate<Sample>({
      load: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return sample("2026-11-12T12:00:00.000Z", "once");
      },
      read: async () => null,
      write: async () => undefined,
      coldStartMs: 2_000,
    });
    const [left, right] = await Promise.all([gate.get("cached"), gate.get("cached")]);
    assert.equal(calls, 1);
    assert.equal(left.state, "ready");
    assert.equal(right.state, "ready");
  });

  it("returns a loading state when the first read exceeds the deadline", async () => {
    let continued = false;
    const gate = createSnapshotGate<Sample>({
      load: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continued = true;
        return sample("2026-11-12T12:00:00.000Z");
      },
      read: async () => null,
      write: async () => undefined,
      coldStartMs: 30,
      schedule: (task) => {
        void task();
      },
    });
    const started = Date.now();
    const result = await gate.get("cached");
    assert.equal(result.state, "pending");
    assert.ok(Date.now() - started < 150);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(continued, true);
    const next = await gate.get("cached");
    assert.equal(next.state, "ready");
  });

  it("keeps the last good snapshot when a refresh fails", async () => {
    const saved = sample("2026-11-12T10:00:00.000Z", "kept");
    let store = saved;
    const jobs: Promise<void>[] = [];
    const gate = createSnapshotGate<Sample>({
      load: async () => {
        throw new Error("https://rpc.example/secret timed out");
      },
      read: async () => store,
      write: async (snapshot) => {
        store = snapshot;
      },
      now: () => Date.parse("2026-11-12T12:00:00.000Z"),
      schedule: (task) => {
        jobs.push(task());
      },
      errorText: () => "rpc timed out",
    });
    const result = await gate.get("cached");
    await Promise.all(jobs);
    assert.equal(result.state, "ready");
    if (result.state !== "ready") return;
    assert.equal(result.snapshot.label, "kept");
    assert.equal(store.label, "kept");
    const forced = await gate.get("fresh");
    assert.equal(forced.state, "error");
    if (forced.state !== "error") return;
    assert.equal(forced.error, "rpc timed out");
    assert.equal(store.label, "kept");
  });
});
