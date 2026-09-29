"use client";
import { STATUS_META } from "@/lib/constants";
import { DIM, MONO } from "@/lib/constants";
import type { StatusRatio } from "@/lib/analytics/rollup";

interface Props {
  ratios: StatusRatio[];
}

export function StatusRatioChart({ ratios }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ratios.map(({ status, count, pct }) => (
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
              {count} · {pct.toFixed(1)}%
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
            aria-label={`${status}: ${pct.toFixed(1)}%`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: STATUS_META[status].color,
                opacity: 0.8,
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
