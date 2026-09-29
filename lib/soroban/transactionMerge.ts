export interface MergeableTransaction {
  id: string;
  [key: string]: unknown;
}

/**
 * Merge two transaction lists, preferring the freshest copy of each
 * transaction (by id) while preserving the order of the incoming list.
 */
export function mergeTransactions<T extends MergeableTransaction>(
  existing: T[],
  incoming: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const tx of existing) {
    byId.set(tx.id, tx);
  }
  for (const tx of incoming) {
    byId.set(tx.id, tx);
  }
  return Array.from(byId.values());
}

/**
 * Adaptive polling interval controller.
 *
 * Tracks recent event frequency and exposes the next poll delay within a
 * defined [minInterval, maxInterval] range: polling faster during bursts of
 * activity and backing off when idle.
 */
export interface AdaptivePollingOptions {
  /** Fastest allowed poll interval in ms (used during bursts). */
  minInterval?: number;
  /** Slowest allowed poll interval in ms (used when idle). */
  maxInterval?: number;
  /** Number of recent polls considered when measuring event rate. */
  windowSize?: number;
}

const DEFAULT_MIN_INTERVAL = 2_000;
const DEFAULT_MAX_INTERVAL = 30_000;
const DEFAULT_WINDOW_SIZE = 5;

/**
 * Tracks recent event counts and computes an adaptive next-poll delay.
 *
 * The delay scales linearly between `minInterval` (when every recent poll
 * produced events) and `maxInterval` (when recent polls were idle).
 */
export class AdaptivePollingController {
  private readonly minInterval: number;
  private readonly maxInterval: number;
  private readonly windowSize: number;
  private readonly recentEventCounts: number[] = [];

  constructor(options: AdaptivePollingOptions = {}) {
    this.minInterval = options.minInterval ?? DEFAULT_MIN_INTERVAL;
    this.maxInterval = options.maxInterval ?? DEFAULT_MAX_INTERVAL;
    this.windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  }

  /** Record the number of events observed in the most recent poll. */
  recordEventCount(count: number): void {
    this.recentEventCounts.push(Math.max(0, count));
    if (this.recentEventCounts.length > this.windowSize) {
      this.recentEventCounts.shift();
    }
  }

  /**
   * Compute the next poll delay in ms based on recent event frequency.
   * Returns `minInterval` during bursts and `maxInterval` when idle.
   */
  nextDelay(): number {
    if (this.recentEventCounts.length === 0) {
      return this.maxInterval;
    }

    const total = this.recentEventCounts.reduce((sum, n) => sum + n, 0);
    const average = total / this.recentEventCounts.length;

    // Normalize activity into [0, 1]; 1+ events per poll is a full burst.
    const activity = Math.min(1, average);

    const delay =
      this.maxInterval - activity * (this.maxInterval - this.minInterval);

    return Math.round(delay);
  }

  /** Reset tracked activity (e.g. after a visibility pause). */
  reset(): void {
    this.recentEventCounts.length = 0;
  }
}
