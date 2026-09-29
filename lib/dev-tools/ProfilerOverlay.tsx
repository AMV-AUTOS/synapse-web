"use client";

import { Profiler, useEffect, useState } from "react";
import type { ProfilerOnRenderCallback } from "react";

/**
 * Dev-only component-level performance profiling harness.
 *
 * All of the code in this module is gated behind `process.env.NODE_ENV !== "production"`
 * so that bundlers can dead-code-eliminate it from production builds. Consumers must
 * import the helpers from here (rather than inlining the logic) so the tree-shaking
 * boundary stays intact.
 */

export type RenderStat = {
  count: number;
  totalDuration: number;
  lastDuration: number;
  maxDuration: number;
};

type Listener = () => void;

const stats = new Map<string, RenderStat>();
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function record(id: string, duration: number) {
  const prev = stats.get(id);
  const next: RenderStat = prev
    ? {
        count: prev.count + 1,
        totalDuration: prev.totalDuration + duration,
        lastDuration: duration,
        maxDuration: Math.max(prev.maxDuration, duration),
      }
    : {
        count: 1,
        totalDuration: duration,
        lastDuration: duration,
        maxDuration: duration,
      };
  stats.set(id, next);
  notify();
}

/**
 * Returns a stable `onRender` callback for React's `<Profiler>` that feeds the
 * in-memory stats store. In production this returns a no-op so the instrumentation
 * can be eliminated.
 */
export function createProfilerOnRender(id: string): ProfilerOnRenderCallback {
  if (process.env.NODE_ENV === "production") {
    return () => {};
  }
  return (_id, _phase, actualDuration) => {
    record(id, actualDuration);
  };
}

/**
 * Wraps a subtree in React's `<Profiler>` when running in development. In production
 * it renders children directly so no profiling overhead ships to users.
 */
export function DevProfiler({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    return <>{children}</>;
  }
  return (
    <Profiler id={id} onRender={createProfilerOnRender(id)}>
      {children}
    </Profiler>
  );
}

function useStats(): RenderStat[] {
  const [, force] = useState(0);
  useEffect(() => {
    const listener: Listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return Array.from(stats.entries())
    .map(([id, stat]) => ({ id, ...stat }))
    .sort((a, b) => b.totalDuration - a.totalDuration);
}

/**
 * Toggleable dev-only overlay showing render count/duration per instrumented component.
 * Renders nothing in production builds.
 */
export function ProfilerOverlay() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return <ProfilerOverlayInner />;
}

function ProfilerOverlayInner() {
  const [open, setOpen] = useState(false);
  const rows = useStats();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && (event.key === "p" || event.key === "P")) {
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid #444",
          background: "#111",
          color: "#0f0",
          cursor: "pointer",
        }}
      >
        {open ? "Hide profiler" : "Profiler"}
      </button>
      {open && (
        <div
          style={{
            marginTop: 6,
            maxHeight: 240,
            overflow: "auto",
            background: "rgba(0,0,0,0.85)",
            color: "#0f0",
            padding: 8,
            borderRadius: 4,
            minWidth: 260,
          }}
        >
          <div style={{ marginBottom: 4, color: "#888" }}>
            Alt+P to toggle
          </div>
          {rows.length === 0 ? (
            <div style={{ color: "#888" }}>No renders recorded yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#888", textAlign: "left" }}>
                  <th>Component</th>
                  <th>Renders</th>
                  <th>Last (ms)</th>
                  <th>Max (ms)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.count}</td>
                    <td>{row.lastDuration.toFixed(2)}</td>
                    <td>{row.maxDuration.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
