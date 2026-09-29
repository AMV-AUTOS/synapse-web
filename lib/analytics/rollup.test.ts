import { describe, it, expect } from "vitest";
import { computeRollup } from "./rollup";
import type { Transaction } from "@/lib/types";

const base = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "test-id",
  asset: "USDC",
  amount: 10,
  status: "COMPLETED",
  timestamp: 1000000,
  from: "GA",
  to: "GB",
  memo: "",
  callback_url: "",
  retries: 0,
  created_at: 1000000,
  ...overrides,
});

describe("computeRollup", () => {
  it("handles empty array", () => {
    const r = computeRollup([]);
    expect(r.totalTxs).toBe(0);
    expect(r.volumeBuckets).toHaveLength(12);
    expect(r.volumeBuckets.every((b) => b.count === 0)).toBe(true);
    expect(r.statusRatios.every((s) => s.pct === 0)).toBe(true);
    expect(r.windowLabel).toBe("no data");
  });

  it("counts total txs", () => {
    const txs = [base(), base({ id: "b" }), base({ id: "c" })];
    expect(computeRollup(txs).totalTxs).toBe(3);
  });

  it("fills correct bucket for each tx", () => {
    const now = 12000;
    // Two txs at start and one at end
    const txs = [
      base({ id: "a", created_at: 0, timestamp: 0 }),
      base({ id: "b", created_at: 0, timestamp: 0 }),
      base({ id: "c", created_at: 12000, timestamp: 12000 }),
    ];
    const r = computeRollup(txs, now);
    const totalCount = r.volumeBuckets.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(3);
  });

  it("computes status ratios correctly", () => {
    const txs = [
      base({ id: "a", status: "COMPLETED" }),
      base({ id: "b", status: "COMPLETED" }),
      base({ id: "c", status: "FAILED" }),
      base({ id: "d", status: "PENDING" }),
    ];
    const r = computeRollup(txs);
    const completed = r.statusRatios.find((s) => s.status === "COMPLETED")!;
    const failed = r.statusRatios.find((s) => s.status === "FAILED")!;
    expect(completed.pct).toBeCloseTo(50);
    expect(failed.pct).toBeCloseTo(25);
    expect(r.statusRatios.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100);
  });

  it("computes stage durations as avg of (timestamp - created_at)", () => {
    const txs = [
      base({ id: "a", status: "COMPLETED", created_at: 0, timestamp: 4000 }),
      base({ id: "b", status: "COMPLETED", created_at: 0, timestamp: 8000 }),
      base({ id: "c", status: "FAILED", created_at: 0, timestamp: 2000 }),
    ];
    const r = computeRollup(txs);
    const completed = r.stageDurations.find((s) => s.status === "COMPLETED")!;
    const failed = r.stageDurations.find((s) => s.status === "FAILED")!;
    expect(completed.avgMs).toBe(6000);
    expect(failed.avgMs).toBe(2000);
  });

  it("ignores negative durations in stage calc", () => {
    const txs = [
      base({ id: "a", status: "PENDING", created_at: 5000, timestamp: 3000 }), // negative
      base({ id: "b", status: "PENDING", created_at: 0, timestamp: 1000 }),
    ];
    const r = computeRollup(txs);
    const pending = r.stageDurations.find((s) => s.status === "PENDING")!;
    expect(pending.avgMs).toBe(1000);
    expect(pending.samples).toBe(1);
  });

  it("windowLabel reflects span", () => {
    const now = Date.now();
    const r1 = computeRollup([base({ created_at: now - 30 * 60 * 1000, timestamp: now })], now);
    expect(r1.windowLabel).toMatch(/min/);

    const r2 = computeRollup([base({ created_at: now - 120 * 60 * 1000, timestamp: now })], now);
    expect(r2.windowLabel).toMatch(/h/);
  });

  it("volumeBuckets amounts match sum of tx amounts", () => {
    const now = 10000;
    const txs = [
      base({ id: "a", created_at: 0, timestamp: 0, amount: 5 }),
      base({ id: "b", created_at: 5000, timestamp: 5000, amount: 15 }),
    ];
    const r = computeRollup(txs, now);
    const totalAmount = r.volumeBuckets.reduce((sum, b) => sum + b.amount, 0);
    expect(totalAmount).toBeCloseTo(20);
  });
});
