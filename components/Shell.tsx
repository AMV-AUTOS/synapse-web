"use client";
import { useState, useEffect, useRef } from "react";
import { DashboardTab } from "./dashboard/DashboardTab";
import { TransactionsTab } from "./transactions/TransactionsTab";
import { AdminTab } from "./admin/AdminTab";
import { DocsTab } from "./docs/DocsTab";
import { AnalyticsTab } from "./analytics/AnalyticsTab";
import { NotificationCenter } from "./notifications/NotificationCenter";
import { NotificationProvider } from "@/lib/notifications/NotificationStore";
import { TabErrorBoundary } from "@/components/ui/TabErrorBoundary";
import { SessionAuditPanel } from "@/components/wallet/SessionAuditPanel";
import { ContractSwitcher } from "@/components/ui/ContractSwitcher";
import { AMBER, BG1, BORDER, DIM, MONO, STATUS_META } from "@/lib/constants";
import { useSorobanStatus } from "@/lib/soroban/useSorobanStatus";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useToast } from "@/components/ui/Toast";
import { shortId } from "@/lib/utils";
import { Profiled, ProfilerOverlay } from "@/lib/dev-tools/ProfilerOverlay";

type Tab = "dashboard" | "transactions" | "analytics" | "admin" | "docs";
const TABS: Tab[] = ["dashboard", "transactions", "analytics", "admin", "docs"];

type Theme = "dark" | "light";
const THEME_STORAGE_KEY = "synapse-theme";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function Shell() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [theme, setTheme] = useState<Theme>("dark");
  const { status: rpcStatus, lastEventAge, health: rpcHealth } = useSorobanStatus();
  const { address, connecting, error, connect, disconnect } = useWallet();
  const connected = address !== null;
  const { toast } = useToast();

  useEffect(() => {
    setTheme(getPreferredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (error) toast(error, "error");
  }, [error, toast]);

  const prevAddress = useRef<string | null>(null);
  useEffect(() => {
    if (address && !prevAddress.current) {
      toast(`Wallet connected: ${shortId(address)}`, "success");
    }
    prevAddress.current = address;
  }, [address, toast]);

  return (
    <NotificationProvider>
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Header ── */}
      <header className="shell-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", color: "var(--fg-strong)" }}>
            SYNAPSE
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: AMBER,
              display: "inline-block",
              boxShadow: `0 0 8px 2px rgba(245,166,35,0.55)`,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", color: "var(--fg-strong)" }}>
            CORE
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ContractSwitcher />
          <span
            style={{
              fontSize: 9,
              color: DIM,
              letterSpacing: "0.14em",
              padding: "3px 10px",
              border: `1px solid ${BORDER}`,
            }}
          >
            TESTNET
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? STATUS_META.COMPLETED.color : "var(--fg-muted)",
              display: "inline-block",
              boxShadow: connected ? `0 0 6px 2px ${STATUS_META.COMPLETED.glow}` : "none",
              transition: "all 0.3s",
            }}
          />
          {connected && <SessionAuditPanel />}
          <NotificationCenter />
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            style={{
              padding: "7px 12px",
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: DIM,
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.06em",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = AMBER;
              e.currentTarget.style.borderColor = AMBER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = DIM;
              e.currentTarget.style.borderColor = BORDER;
            }}
          >
            {theme === "dark" ? "☀ light" : "☾ dark"}
          </button>
          <button
            onClick={() => (connected ? disconnect() : connect())}
            disabled={connecting}
            style={{
              padding: "7px 18px",
              background: connected ? "transparent" : "rgba(245,166,35,0.08)",
              border: `1px solid ${connected ? BORDER : AMBER}`,
              color: connected ? "var(--fg-muted)" : AMBER,
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 600,
              cursor: connecting ? "wait" : "pointer",
              letterSpacing: "0.06em",
              transition: "all 0.2s",
              opacity: connecting ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!connected) e.currentTarget.style.background = "rgba(245,166,35,0.16)";
            }}
            onMouseLeave={(e) => {
              if (!connected) e.currentTarget.style.background = "rgba(245,166,35,0.08)";
            }}
          >
            {connecting ? "connecting…" : connected ? shortId(address) : "connect wallet"}
          </button>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav className="shell-nav" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 22px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.1em",
              color: tab === t ? "var(--fg-strong)" : DIM,
              borderBottom: tab === t ? `2px solid ${AMBER}` : "2px solid transparent",
              marginBottom: -1,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (tab !== t) e.currentTarget.style.color = "var(--fg-hover)";
            }}
            onMouseLeave={(e) => {
              if (tab !== t) e.currentTarget.style.color = DIM;
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* ── Body ── */}
      <main className="shell-main">
        {tab === "dashboard" && (
          <TabErrorBoundary title="Dashboard tab error">
            <Profiled id="DashboardTab">
              <DashboardTab />
            </Profiled>
          </TabErrorBoundary>
        )}
        {tab === "transactions" && (
          <TabErrorBoundary title="Transactions tab error">
            <Profiled id="TransactionsTab">
              <TransactionsTab />
            </Profiled>
          </TabErrorBoundary>
        )}
        {tab === "analytics" && (
          <TabErrorBoundary title="Analytics tab error">
            <AnalyticsTab />
          </TabErrorBoundary>
        )}
        {tab === "admin" && (
          <TabErrorBoundary title="Admin tab error">
            <Profiled id="AdminTab">
              <AdminTab />
            </Profiled>
          </TabErrorBoundary>
        )}
        {tab === "docs" && (
          <TabErrorBoundary title="Docs tab error">
            <Profiled id="DocsTab">
              <DocsTab />
            </Profiled>
          </TabErrorBoundary>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: "10px 28px",
          display: "flex",
          justifyContent: "space-between",
          background: BG1,
        }}
      >
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.1em" }}>
          SYNAPSE CORE · v0.1.0 · TESTNET
        </span>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.1em",
            color:
              rpcStatus === "connected"
                ? STATUS_META.COMPLETED.color
                : rpcStatus === "error"
                  ? STATUS_META.FAILED.color
                  : DIM,
          }}
        >
          ⬡ SOROBAN RPC:{" "}
          {rpcStatus === "connected"
            ? `connected${lastEventAge ? ` · last event ${lastEventAge}` : ""}`
            : rpcStatus === "error"
              ? `error${rpcHealth.error ? `: ${rpcHealth.error}` : ""}`
              : "connecting"}
        </span>
      </footer>

      <ProfilerOverlay />
    </div>
    </NotificationProvider>
  );
}
