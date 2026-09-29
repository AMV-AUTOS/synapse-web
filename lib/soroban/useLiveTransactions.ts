"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { scValToNative } from "@stellar/stellar-sdk";
import { useSoroban, useSorobanEvents } from "./SorobanProvider";
import { simulateContractCall, stringArg } from "./contract";
import {
  mergeTransactionEvents,
  nativeToTransaction,
  PLACEHOLDER_MARKER,
} from "./transactionMerge";
import { useWallet } from "@/lib/wallet/WalletProvider";
import type { Transaction } from "@/lib/types";

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

/**
 * Adaptive backoff polling controller for live transaction updates.
 *
 * Tracks recent event frequency and exposes the next poll delay within a
 * defined min/max range: polling faster during bursts of activity and backing
 * off when idle. Polling pauses entirely while the document is hidden and
 * resumes with an immediate catch-up poll on visibility return so events that
 * occurred during the paused window are not missed.
 */
export const MIN_POLL_INTERVAL_MS = 2_000;
export const MAX_POLL_INTERVAL_MS = 30_000;
const BURST_THRESHOLD = 3;
const IDLE_THRESHOLD = 1;

/**
 * Computes the next poll delay from the number of events observed in the most
 * recent poll, clamped to the [MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS]
 * range. Bursts shorten the delay; idle periods lengthen it.
 */
export function nextPollDelay(recentEventCount: number): number {
  if (recentEventCount >= BURST_THRESHOLD) return MIN_POLL_INTERVAL_MS;
  if (recentEventCount <= IDLE_THRESHOLD) return MAX_POLL_INTERVAL_MS;
  const ratio = (recentEventCount - IDLE_THRESHOLD) / (BURST_THRESHOLD - IDLE_THRESHOLD);
  const delay = MAX_POLL_INTERVAL_MS - ratio * (MAX_POLL_INTERVAL_MS - MIN_POLL_INTERVAL_MS);
  return Math.round(Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, delay)));
}

/**
 * Merges the mock baseline with live events from the RPC event poller (see
 * mergeTransactionEvents). When a wallet is connected and a real contract is
 * configured, placeholder rows are enriched with full details via a
 * get_transaction() read-only call.
 *
 * When the active contractId changes, enriched state and fetch tracking are
 * cleared immediately to guarantee no stale transaction data leaks.
 */
export function useLiveTransactions(): Transaction[] {
  const events = useSorobanEvents();
  const { contractId } = useSoroban();
  const { address } = useWallet();
  const [enriched, setEnriched] = useState<Record<string, Transaction>>({});
  const fetchedIds = useRef<Set<string>>(new Set());

  // Clear enriched state and fetched tracker whenever contractId changes
  useEffect(() => {
    setEnriched({});
    fetchedIds.current.clear();
  }, [contractId]);

  const baseline = useMemo(() => mergeTransactionEvents(events), [events]);

  // Adaptive polling: track the previous event count to derive the next delay.
  const prevCount = useRef<number>(events.length);
  const [pollDelay, setPollDelay] = useState<number>(MIN_POLL_INTERVAL_MS);
  const [paused, setPaused] = useState<boolean>(false);

  useEffect(() => {
    const delta = Math.max(0, events.length - prevCount.current);
    prevCount.current = events.length;
    setPollDelay(nextPollDelay(delta));
  }, [events]);

  // Pause polling while the tab is hidden; resume with an immediate catch-up
  // poll on visibility return so events from the paused window are not missed.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === "hidden";
      setPaused(hidden);
      if (!hidden) {
        // Immediate catch-up poll covering the paused window.
        prevCount.current = -1;
        setPollDelay(MIN_POLL_INTERVAL_MS);
      }
    };
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!address || !contractId || paused) return;

    const toFetch = baseline.filter(
      (tx) => tx.asset === PLACEHOLDER_MARKER && !fetchedIds.current.has(tx.id)
    );
    if (toFetch.length === 0) return;

    for (const tx of toFetch) {
      fetchedIds.current.add(tx.id);
      simulateContractCall(RPC_URL, contractId, address, "get_transaction", [stringArg(tx.id)])
        .then((simulated) => {
          if (!simulated.result) return;
          const native = scValToNative(simulated.result.retval);
          setEnriched((prev) => ({ ...prev, [tx.id]: nativeToTransaction(tx.id, native, tx) }));
        })
        .catch(() => {
          // Leave the placeholder row in place; enrichment is best-effort.
        });
    }
  }, [baseline, address, contractId, paused, pollDelay]);

  return useMemo(() => baseline.map((tx) => enriched[tx.id] ?? tx), [baseline, enriched]);
}
