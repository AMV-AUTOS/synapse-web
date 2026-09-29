"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SorobanTip } from "@/components/ui/SorobanTip";
import { BORDER, DIM, MONO } from "@/lib/constants";
import type { ContractInfo } from "@/lib/types";
import { useWallet } from "@/lib/wallet/WalletProvider";

const HORIZON_URLS: Record<string, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
};

const BALANCE_TTL_MS = 15_000;
const ESTIMATED_FEE_XLM = 0.00001;
const LOW_BALANCE_THRESHOLD_XLM = 1;

type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unfunded" }
  | { status: "error"; message: string }
  | { status: "ok"; xlm: number; assets: { code: string; balance: string }[] };

function horizonUrlFor(network: string): string {
  const key = (network || "").toLowerCase();
  return HORIZON_URLS[key] ?? HORIZON_URLS.testnet;
}

function formatXlm(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

export function ContractInfoPanel({ info }: { info: ContractInfo }) {
  const { address, network, lastSubmittedAt } = useWallet();
  const [balance, setBalance] = useState<BalanceState>({ status: "idle" });

  const loadBalance = useCallback(
    async (account: string, net: string, signal: { cancelled: boolean }) => {
      setBalance({ status: "loading" });
      try {
        const res = await fetch(`${horizonUrlFor(net)}/accounts/${account}`);
        if (signal.cancelled) return;
        if (res.status === 404) {
          setBalance({ status: "unfunded" });
          return;
        }
        if (!res.ok) {
          setBalance({ status: "error", message: `Horizon responded ${res.status}` });
          return;
        }
        const data = (await res.json()) as {
          balances?: { asset_type: string; balance: string; asset_code?: string }[];
        };
        const balances = data.balances ?? [];
        const native = balances.find((b) => b.asset_type === "native");
        const xlm = native ? Number(native.balance) : 0;
        const assets = balances
          .filter((b) => b.asset_type !== "native")
          .map((b) => ({ code: b.asset_code ?? "?", balance: b.balance }));
        setBalance({ status: "ok", xlm, assets });
      } catch (err) {
        if (signal.cancelled) return;
        setBalance({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load balance",
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (!address) {
      setBalance({ status: "idle" });
      return;
    }
    const signal = { cancelled: false };
    loadBalance(address, network, signal);
    const timer = setInterval(() => loadBalance(address, network, signal), BALANCE_TTL_MS);
    return () => {
      signal.cancelled = true;
      clearInterval(timer);
    };
  }, [address, network, lastSubmittedAt, loadBalance]);

  const rows: [string, string][] = [
    ["version", info.version],
    ["network", info.network],
    ["address", info.address],
    ["admin", info.admin],
    ["relay signer", info.relay_signer],
    ["health", info.health],
  ];

  const lowBalance =
    balance.status === "ok" && balance.xlm < LOW_BALANCE_THRESHOLD_XLM;

  return (
    <Panel title="CONTRACT INFO">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: `1px solid ${BORDER}` }}>
              <td
                style={{
                  padding: "6px 0",
                  fontSize: 11,
                  color: DIM,
                  fontFamily: MONO,
                  width: "38%",
                  verticalAlign: "top",
                }}
              >
                {k}
              </td>
              <td
                style={{
                  padding: "6px 0 6px 8px",
                  fontSize: 10,
                  color: "#ccc",
                  fontFamily: MONO,
                  textAlign: "right",
                  wordBreak: "break-all",
                  maxWidth: 180,
                }}
              >
                {v}
              </td>
            </tr>
          ))}
          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
            <td
              style={{
                padding: "6px 0",
                fontSize: 11,
                color: DIM,
                fontFamily: MONO,
                width: "38%",
                verticalAlign: "top",
              }}
            >
              balance
            </td>
            <td
              style={{
                padding: "6px 0 6px 8px",
                fontSize: 10,
                color: lowBalance ? "#f5a623" : "#ccc",
                fontFamily: MONO,
                textAlign: "right",
                wordBreak: "break-all",
                maxWidth: 180,
              }}
            >
              {balance.status === "idle" && "—"}
              {balance.status === "loading" && "loading…"}
              {balance.status === "unfunded" && "account not funded"}
              {balance.status === "error" && `error: ${balance.message}`}
              {balance.status === "ok" && `${formatXlm(balance.xlm)} XLM`}
            </td>
          </tr>
          {balance.status === "ok" &&
            balance.assets.map((a) => (
              <tr key={a.code} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td
                  style={{
                    padding: "6px 0",
                    fontSize: 11,
                    color: DIM,
                    fontFamily: MONO,
                    width: "38%",
                    verticalAlign: "top",
                  }}
                >
                  {a.code}
                </td>
                <td
                  style={{
                    padding: "6px 0 6px 8px",
                    fontSize: 10,
                    color: "#ccc",
                    fontFamily: MONO,
                    textAlign: "right",
                    wordBreak: "break-all",
                    maxWidth: 180,
                  }}
                >
                  {a.balance}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {lowBalance && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 8px",
            border: "1px solid #f5a623",
            borderRadius: 4,
            fontSize: 10,
            color: "#f5a623",
            fontFamily: MONO,
          }}
        >
          low balance: {formatXlm(balance.xlm)} XLM may not cover the estimated fee of{" "}
          {ESTIMATED_FEE_XLM} XLM
        </div>
      )}
      {balance.status === "unfunded" && (
        <SorobanTip>
          account not found on {network} — fund it via friendbot before submitting transactions
        </SorobanTip>
      )}
      <SorobanTip>health() + version() → populate on load via read-only simulation</SorobanTip>
    </Panel>
  );
}
