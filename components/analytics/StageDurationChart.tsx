"use client";
import { STATUS_META } from "@/lib/constants";
import { DIM, MONO } from "@/lib/constants";
import type { StageDuration } from "@/lib/analytics/rollup";

interface Props {
  durations: StageDuration[];
}

function fmtDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function StageDurationChart({ durations }: Props) {
  const maxMs = Math.max(...durations.map((d) => d.avgMs), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {durations.map(({ status, avgMs, samples }) => (
        <div key={status}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontFamily: MONO,
                letterSpacing: "0.1em",
                color: STATUS_META[status].color,
              }}
            >
              {status}
            </span>
            <span style={{ fontSize: 9, fontFamily: MONO, color: DIM }}>
              {fmtDuration(avgMs)}
              {samples > 0 ? ` · ${samples} sample${samples !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 2,
              overflow: "hidden",
            }}
            role="meter"
            aria-label={`${status} avg duration: ${fmtDuration(avgMs)}`}
            aria-valuenow={avgMs}
            aria-valuemin={0}
            aria-valuemax={maxMs}
          >
            <div
              style={{
                height: "100%",
                width: `${maxMs > 0 ? (avgMs / maxMs) * 100 : 0}%`,
                background: STATUS_META[status].color,
                opacity: 0.65,
                transition: "width 0.4s ease",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
