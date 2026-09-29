"use client";
import { AMBER, BG3, DIM, MONO } from "@/lib/constants";
import type { VolumeBucket } from "@/lib/analytics/rollup";

interface Props {
  buckets: VolumeBucket[];
}

export function VolumeChart({ buckets }: Props) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          height: 80,
          paddingBottom: 4,
        }}
        role="img"
        aria-label="Transaction volume bar chart"
      >
        {buckets.map((b, i) => {
          const heightPct = (b.count / maxCount) * 100;
          return (
            <div
              key={i}
              title={`${b.label}: ${b.count} tx`}
              style={{
                flex: 1,
                height: `${Math.max(heightPct, b.count > 0 ? 6 : 1)}%`,
                background: b.count > 0 ? AMBER : BG3,
                opacity: b.count > 0 ? 0.85 : 0.3,
                transition: "height 0.3s ease",
                minHeight: 1,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 8, color: DIM, fontFamily: MONO }}>{buckets[0]?.label ?? ""}</span>
        <span style={{ fontSize: 8, color: DIM, fontFamily: MONO }}>
          {buckets[buckets.length - 1]?.label ?? ""}
        </span>
      </div>
    </div>
  );
}
