import type { Transaction, TxStatus } from "@/lib/types";

export interface VolumeBucket {
  label: string; // e.g. "12:00"
  count: number;
  amount: number;
}

export interface StatusRatio {
  status: TxStatus;
  count: number;
  pct: number;
}

export interface StageDuration {
  status: TxStatus;
  avgMs: number;
  samples: number;
}

export interface AnalyticsRollup {
  volumeBuckets: VolumeBucket[];
  statusRatios: StatusRatio[];
  stageDurations: StageDuration[];
  totalTxs: number;
  windowLabel: string;
}

const BUCKET_COUNT = 12;

/**
 * Buckets transactions by created_at into BUCKET_COUNT equal-width slots
 * spanning from the oldest tx to now (or a single slot when there is only
 * one data point / no spread).
 */
function buildVolumeBuckets(txs: Transaction[], now: number): VolumeBucket[] {
  if (txs.length === 0) {
    return Array.from({ length: BUCKET_COUNT }, (_, i) => ({
      label: `${i}`,
      count: 0,
      amount: 0,
    }));
  }

  const oldest = Math.min(...txs.map((t) => t.created_at));
  const span = Math.max(now - oldest, 1);
  const bucketMs = span / BUCKET_COUNT;

  const buckets: VolumeBucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const edgeMs = oldest + (i + 1) * bucketMs;
    const d = new Date(edgeMs);
    const label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { label, count: 0, amount: 0 };
  });

  for (const tx of txs) {
    const idx = Math.min(Math.floor((tx.created_at - oldest) / bucketMs), BUCKET_COUNT - 1);
    const bucket = buckets[idx];
    if (bucket) {
      bucket.count += 1;
      bucket.amount += tx.amount;
    }
  }

  return buckets;
}

/**
 * Computes success/fail/pending/processing ratios as percentages.
 */
function buildStatusRatios(txs: Transaction[]): StatusRatio[] {
  const counts: Record<TxStatus, number> = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };
  for (const tx of txs) {
    counts[tx.status] = (counts[tx.status] ?? 0) + 1;
  }
  const total = txs.length;
  return (Object.keys(counts) as TxStatus[]).map((status) => ({
    status,
    count: counts[status],
    pct: total > 0 ? (counts[status] / total) * 100 : 0,
  }));
}

/**
 * Estimates average time-in-stage by using (timestamp - created_at) as a
 * proxy for how long the transaction spent reaching its current state.
 * Grouped per status so callers can show "avg time to COMPLETED" etc.
 */
function buildStageDurations(txs: Transaction[]): StageDuration[] {
  const totals: Record<TxStatus, { sum: number; n: number }> = {
    PENDING: { sum: 0, n: 0 },
    PROCESSING: { sum: 0, n: 0 },
    COMPLETED: { sum: 0, n: 0 },
    FAILED: { sum: 0, n: 0 },
  };

  for (const tx of txs) {
    const duration = tx.timestamp - tx.created_at;
    if (duration >= 0) {
      totals[tx.status].sum += duration;
      totals[tx.status].n += 1;
    }
  }

  return (Object.keys(totals) as TxStatus[]).map((status) => ({
    status,
    avgMs: totals[status].n > 0 ? totals[status].sum / totals[status].n : 0,
    samples: totals[status].n,
  }));
}

/**
 * Pure reduce over an array of transactions → chart-ready rollup.
 * Safe with empty arrays; produces zero-value buckets.
 */
export function computeRollup(txs: Transaction[], now = Date.now()): AnalyticsRollup {
  const oldest = txs.length > 0 ? Math.min(...txs.map((t) => t.created_at)) : now;
  const spanMs = now - oldest;
  const spanMin = Math.round(spanMs / 60000);
  const windowLabel =
    txs.length === 0
      ? "no data"
      : spanMin < 2
        ? "last few seconds"
        : spanMin < 60
          ? `last ${spanMin} min`
          : `last ${Math.round(spanMin / 60)} h`;

  return {
    volumeBuckets: buildVolumeBuckets(txs, now),
    statusRatios: buildStatusRatios(txs),
    stageDurations: buildStageDurations(txs),
    totalTxs: txs.length,
    windowLabel,
  };
}
