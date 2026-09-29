import { rpc } from "@stellar/stellar-sdk";

const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const CURSOR_STORAGE_KEY = "soroban-event-cursor";

// Adaptive polling bounds. Poll faster during bursts of activity, back off when idle.
export const MIN_POLL_INTERVAL_MS = 2000;
export const MAX_POLL_INTERVAL_MS = 30000;
// Number of recent polls considered when estimating event frequency.
const RATE_WINDOW = 5;

export type SorobanEventType = "TransactionRegistered" | "StatusChanged";

export interface NormalizedSorobanEvent {
  id: string;
  type: SorobanEventType;
  promptId?: string;
  txId?: string;
  fromStatus?: string;
  toStatus?: string;
  timestamp: number;
  ledger: number;
  raw: rpc.Api.EventResponse;
}

export interface RpcHealth {
  connected: boolean;
  lastCheck: number;
  lastEventTimestamp: number | null;
  error: string | null;
}

/**
 * Tracks recent event frequency and exposes the next poll delay.
 * More events in the recent window => shorter delay (down to MIN_POLL_INTERVAL_MS).
 * No events => delay grows back toward MAX_POLL_INTERVAL_MS.
 */
export function createIntervalController(
  minInterval: number = MIN_POLL_INTERVAL_MS,
  maxInterval: number = MAX_POLL_INTERVAL_MS,
) {
  const recentCounts: number[] = [];
  let currentDelay = minInterval;

  function record(count: number): void {
    recentCounts.push(count);
    if (recentCounts.length > RATE_WINDOW) recentCounts.shift();

    const total = recentCounts.reduce((sum, n) => sum + n, 0);
    const avg = total / recentCounts.length;

    if (avg <= 0) {
      // Idle: back off exponentially toward the max interval.
      currentDelay = Math.min(maxInterval, Math.max(minInterval, currentDelay * 2));
    } else {
      // Active: scale delay inversely with average event count.
      currentDelay = Math.min(maxInterval, Math.max(minInterval, Math.round(minInterval / avg)));
    }
  }

  function nextDelay(): number {
    return currentDelay;
  }

  function reset(): void {
    recentCounts.length = 0;
    currentDelay = minInterval;
  }

  return { record, nextDelay, reset };
}

export type IntervalController = ReturnType<typeof createIntervalController>;

function getCursorKey(contractId?: string): string {
  return contractId ? `${CURSOR_STORAGE_KEY}:${contractId}` : CURSOR_STORAGE_KEY;
}

function getStoredCursor(contractId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(getCursorKey(contractId));
  } catch {
    return null;
  }
}

function storeCursor(contractId: string | undefined, cursor: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getCursorKey(contractId), cursor);
  } catch {}
}

export function createSorobanEventPoller(rpcUrl: string = DEFAULT_RPC_URL, contractId?: string) {
  const server = new rpc.Server(rpcUrl);
  let cursor: string | null = getStoredCursor(contractId);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  const controller = createIntervalController();
  const health: RpcHealth = {
    connected: false,
    lastCheck: 0,
    lastEventTimestamp: null,
    error: null,
  };
  let healthListeners: Array<(h: RpcHealth) => void> = [];
  let eventListeners: Array<(events: NormalizedSorobanEvent[]) => void> = [];

  function notifyHealth() {
    healthListeners.forEach((fn) => fn({ ...health }));
  }

  function notifyEvents(events: NormalizedSorobanEvent[]) {
    if (events.length > 0) {
      health.lastEventTimestamp = Date.now();
    }
    eventListeners.forEach((fn) => fn(events));
  }

  function normalizeEvent(raw: rpc.Api.EventResponse): NormalizedSorobanEvent | null {
    try {
      const topics = raw.topic ?? [];
      const typeStr = topics[0]?.toString() ?? "";
      const timestamp = raw.ledgerClosedAt ? new Date(raw.ledgerClosedAt).getTime() : Date.now();

      if (typeStr.includes("TransactionRegistered")) {
        return {
          id: raw.id,
          type: "TransactionRegistered",
          txId: topics[1]?.toString(),
          timestamp,
          ledger: raw.ledger,
          raw,
        };
      }

      if (typeStr.includes("StatusChanged")) {
        return {
          id: raw.id,
          type: "StatusChanged",
          txId: topics[1]?.toString(),
          fromStatus: topics[2]?.toString(),
          toStatus: topics[3]?.toString(),
          timestamp,
          ledger: raw.ledger,
          raw,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async function poll(): Promise<void> {
    try {
      health.lastCheck = Date.now();
      health.connected = true;
      health.error = null;

      const filters: rpc.Api.EventFilter[] = contractId
        ? [{ contractIds: [contractId], type: "contract" }]
        : [];

      const request: rpc.Api.GetEventsRequest = cursor
        ? { filters, cursor, limit: 100 }
        : { filters, startLedger: (await server.getLatestLedger()).sequence, limit: 100 };

      const response = await server.getEvents(request);

      let eventCount = 0;
      if (response && response.events) {
        const normalized: NormalizedSorobanEvent[] = [];
        for (const event of response.events) {
          const n = normalizeEvent(event);
          if (n) normalized.push(n);
        }

        const lastEvent = response.events[response.events.length - 1];
        if (lastEvent) {
          cursor = lastEvent.id;
          storeCursor(contractId, cursor);
        }

        eventCount = normalized.length;
        notifyEvents(normalized);
      }

      controller.record(eventCount);
      notifyHealth();
    } catch (err) {
      health.connected = false;
      health.error = err instanceof Error ? err.message : "Unknown RPC error";
      // Treat errors as idle so we back off rather than hammering a failing RPC.
      controller.record(0);
      notifyHealth();
    }
  }

  function scheduleNext(): void {
    if (!running) return;
    pollTimer = setTimeout(async () => {
      await poll();
      scheduleNext();
    }, controller.nextDelay());
  }

  function handleVisibilityChange(): void {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      // Pause entirely while the tab is backgrounded.
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    } else if (running && !pollTimer) {
      // Resume with an immediate catch-up poll covering the paused window.
      controller.reset();
      void poll().then(() => scheduleNext());
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    void poll().then(() => scheduleNext());
  }

  function stop(): void {
    running = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  }

  function onHealth(fn: (h: RpcHealth) => void): () => void {
    healthListeners.push(fn);
    return () => {
      healthListeners = healthListeners.filter((l) => l !== fn);
    };
  }

  function onEvents(fn: (events: NormalizedSorobanEvent[]) => void): () => void {
    eventListeners.push(fn);
    return () => {
      eventListeners = eventListeners.filter((l) => l !== fn);
    };
  }

  function getHealth(): RpcHealth {
    return { ...health };
  }

  function getCursor(): string | null {
    return cursor;
  }

  function resetCursor(): void {
    cursor = null;
    storeCursor(contractId, "");
  }

  return {
    start,
    stop,
    poll,
    onHealth,
    onEvents,
    getHealth,
    getCursor,
    resetCursor,
  };
}

export type SorobanEventPoller = ReturnType<typeof createSorobanEventPoller>;
