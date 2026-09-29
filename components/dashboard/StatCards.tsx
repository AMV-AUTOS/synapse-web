"use client";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { DIM, MONO, NEUTRAL, STATUS_META } from "@/lib/constants";
import type { Transaction } from "@/lib/types";

interface StatCardsProps {
  txs: Transaction[];
  loading?: boolean;
}

export function StatCards({ txs, loading = false }: StatCardsProps) {
  const counts = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0 };
  txs.forEach((t) => {
    counts[t.status]++;
  });

  const cards = [
    { label: "TOTAL TXS", value: txs.length, sub: "mock data", color: NEUTRAL },
    {
      label: "PENDING",
      value: counts.PENDING,
      sub: "awaiting pickup",
      color: STATUS_META.PENDING.color,
    },
    {
      label: "COMPLETED",
      value: counts.COMPLETED,
      sub: "settled on-chain",
      color: STATUS_META.COMPLETED.color,
    },
    {
      label: "FAILED",
      value: counts.FAILED,
      sub: "terminal errors",
      color: STATUS_META.FAILED.color,
    },
  ];

  return (
    <div className="stat-cards-grid">
      {cards.map((c) => (
        <Panel key={c.label} accentColor={c.color} style={{ minWidth: 120 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: DIM,
              fontFamily: MONO,
              marginBottom: 8,
            }}
          >
            {c.label}
          </div>
          {loading ? (
            <>
              <div style={{ marginBottom: 4 }}>
                <Skeleton variant="block" width={48} height={28} radius={4} />
              </div>
              <Skeleton variant="block" width={90} height={10} radius={3} />
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: MONO,
                  color: c.color,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {c.value}
              </div>
              <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>
                {c.sub}
              </div>
            </>
          )}
        </Panel>
      ))}
    </div>
  );
}
