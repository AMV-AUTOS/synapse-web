"use client";
import { useMemo } from "react";
import { useLiveTransactions } from "@/lib/soroban/useLiveTransactions";
import { computeRollup } from "@/lib/analytics/rollup";
import { Panel } from "@/components/ui/Panel";
import { VolumeChart } from "./VolumeChart";
import { StatusRatioChart } from "./StatusRatioChart";
import { StageDurationChart } from "./StageDurationChart";
import { AMBER, BG3, BORDER, DIM, MONO } from "@/lib/constants";

export function AnalyticsTab() {
  const txs = useLiveTransactions();
  const rollup = useMemo(() => computeRollup(txs), [txs]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      className="animate-fade-in"
      data-testid="analytics-tab"
    >
      {/* Session disclaimer */}
      <div
        style={{
          padding: "8px 14px",
          border: `1px solid ${BORDER}`,
          background: BG3,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 9, color: AMBER, fontFamily: MONO, letterSpacing: "0.1em" }}>
          ⓘ
        </span>
        <span style={{ fontSize: 9, color: DIM, fontFamily: MONO, letterSpacing: "0.08em" }}>
          Charts reflect locally observed history since this session/cache began — not a full
          historical record. Window: {rollup.windowLabel} · {rollup.totalTxs} transaction
          {rollup.totalTxs !== 1 ? "s" : ""}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {/* Volume over time */}
        <Panel title="TRANSACTION VOLUME OVER TIME" accentColor={AMBER}>
          {rollup.totalTxs === 0 ? (
            <EmptyState message="No transactions observed yet." />
          ) : (
            <VolumeChart buckets={rollup.volumeBuckets} />
          )}
        </Panel>

        {/* Success / fail rate */}
        <Panel title="SUCCESS / FAIL RATE" accentColor={AMBER}>
          {rollup.totalTxs === 0 ? (
            <EmptyState message="No transactions observed yet." />
          ) : (
            <StatusRatioChart ratios={rollup.statusRatios} />
          )}
        </Panel>

        {/* Avg time-in-stage */}
        <Panel title="AVG TIME-IN-STAGE" accentColor={AMBER}>
          {rollup.totalTxs === 0 ? (
            <EmptyState message="No transactions observed yet." />
          ) : (
            <StageDurationChart durations={rollup.stageDurations} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        height: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      data-testid="empty-state"
    >
      <span style={{ fontSize: 10, color: DIM, fontFamily: MONO, letterSpacing: "0.1em" }}>
        {message}
      </span>
    </div>
  );
}
