"use client";
import { useState } from "react";
import { scValToNative } from "@stellar/stellar-sdk";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { SorobanTip } from "@/components/ui/SorobanTip";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSoroban } from "@/lib/soroban/SorobanProvider";
import { invokeContract, simulateContractCall, stringArg } from "@/lib/soroban/contract";
import { AMBER, BG1, BG2, BORDER, DIM, MONO, STATUS_META } from "@/lib/constants";
import { formatAmount, shortId } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

interface TxDetailModalProps {
  tx: Transaction;
  onClose: () => void;
}

export function TxDetailModal({ tx, onClose }: TxDetailModalProps) {
  const [showFailPrompt, setShowFailPrompt] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { address, connect } = useWallet();
  const { contractId } = useSoroban();
  const { toast } = useToast();
  const m = STATUS_META[tx.status];

  async function runTxCall(method: string, extraArgs: string[] = []) {
    if (!contractId) {
      toast("No contract ID is currently selected or configured", "error");
      return;
    }
    if (!address) {
      toast("Connect a wallet before submitting transactions", "error");
      await connect();
      return;
    }
    setPendingAction(method);
    try {
      const args = [stringArg(tx.id), ...extraArgs.map(stringArg)];
      const result = await invokeContract(RPC_URL, contractId, address, method, args);
      toast(
        `${method}() ${result.status === "SUCCESS" ? "succeeded" : "failed"} · tx ${shortId(result.hash)}`,
        result.status === "SUCCESS" ? "success" : "error"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : `${method}() failed`, "error");
    } finally {
      setPendingAction(null);
    }
  }

  async function runIsDuplicate() {
    if (!contractId) {
      toast("No contract ID is currently selected or configured", "error");
      return;
    }
    if (!address) {
      toast("Connect a wallet to run this read-only check", "error");
      await connect();
      return;
    }
    setPendingAction("is_duplicate");
    try {
      const simulated = await simulateContractCall(RPC_URL, contractId, address, "is_duplicate", [
        stringArg(tx.id),
      ]);
      const isDuplicate = simulated.result ? scValToNative(simulated.result.retval) : undefined;
      toast(`is_duplicate(${shortId(tx.id)}) → ${JSON.stringify(isDuplicate)}`, "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "is_duplicate() failed", "error");
    } finally {
      setPendingAction(null);
    }
  }

  const fields: [string, string][] = [
    ["id", tx.id],
    ["asset", tx.asset],
    ["amount", `${formatAmount(tx.amount)} USDC`],
    ["from", tx.from],
    ["to", tx.to],
    ["memo", tx.memo],
    ["callback_url", tx.callback_url],
    ["retries", String(tx.retries)],
    ["created_at", new Date(tx.created_at).toISOString()],
    ["status", tx.status],
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in"
        style={{
          background: BG1,
          border: `1px solid ${m.color}44`,
          width: 560,
          maxHeight: "82vh",
          overflowY: "auto",
          padding: 24,
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: AMBER,
              letterSpacing: "0.1em",
            }}
          >
            TX DETAIL
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge status={tx.status} />
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                color: DIM,
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Fields */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <tbody>
            {fields.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td
                  style={{
                    padding: "6px 0",
                    fontSize: 10,
                    color: DIM,
                    fontFamily: MONO,
                    width: "28%",
                    verticalAlign: "top",
                  }}
                >
                  {k}
                </td>
                <td
                  style={{
                    padding: "6px 0 6px 8px",
                    fontSize: 10,
                    color: "#ddd",
                    fontFamily: MONO,
                    wordBreak: "break-all",
                  }}
                >
                  <span style={{ verticalAlign: "middle" }}>{v}</span>
                  {(k === "id" || k === "from" || k === "to") && (
                    <CopyButton
                      value={v}
                      label={k === "id" ? "Tx ID" : k === "from" ? "From address" : "To address"}
                      style={{ marginLeft: 6, verticalAlign: "middle" }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Action buttons */}
        {showFailPrompt ? (
          <div
            style={{
              marginBottom: 12,
              padding: 16,
              background: BG2,
              border: `1px solid ${STATUS_META.FAILED.color}33`,
              borderRadius: 4,
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: STATUS_META.FAILED.color,
                fontWeight: 600,
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              FAIL TRANSACTION REASON
            </div>
            <textarea
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="Enter failure reason..."
              style={{
                width: "100%",
                height: 72,
                background: BG1,
                border: `1px solid ${BORDER}`,
                color: "#fff",
                fontFamily: MONO,
                fontSize: 11,
                padding: "8px 10px",
                resize: "none",
                outline: "none",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={!failReason.trim() || pendingAction === "fail_transaction"}
                onClick={async () => {
                  const reason = failReason.trim();
                  setShowFailPrompt(false);
                  setFailReason("");
                  await runTxCall("fail_transaction", [reason]);
                }}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  background: failReason.trim() ? STATUS_META.FAILED.color : "transparent",
                  border: `1px solid ${STATUS_META.FAILED.color}`,
                  color: failReason.trim() ? "#000" : STATUS_META.FAILED.color,
                  opacity: failReason.trim() ? 1 : 0.4,
                  cursor: failReason.trim() ? "pointer" : "not-allowed",
                  fontFamily: MONO,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  transition: "all 0.15s",
                }}
              >
                SUBMIT FAILURE
              </button>
              <button
                onClick={() => {
                  setShowFailPrompt(false);
                  setFailReason("");
                }}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  background: "transparent",
                  border: `1px solid ${DIM}`,
                  color: DIM,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  transition: "all 0.15s",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <ActionButton
              label={pendingAction === "start_processing" ? "SUBMITTING…" : "START PROCESSING"}
              color={STATUS_META.PROCESSING.color}
              disabled={pendingAction !== null}
              onClick={() => runTxCall("start_processing")}
            />
            <ActionButton
              label={pendingAction === "complete_transaction" ? "SUBMITTING…" : "COMPLETE"}
              color={STATUS_META.COMPLETED.color}
              disabled={pendingAction !== null}
              onClick={() => runTxCall("complete_transaction")}
            />
            <ActionButton
              label="FAIL"
              color={STATUS_META.FAILED.color}
              disabled={pendingAction !== null}
              onClick={() => setShowFailPrompt(true)}
            />
            <ActionButton
              label={pendingAction === "is_duplicate" ? "CHECKING…" : "DUPLICATE?"}
              color={AMBER}
              disabled={pendingAction !== null}
              onClick={runIsDuplicate}
            />
          </div>
        )}

        <SorobanTip>
          get_transaction(tx_id) → full Transaction struct; actions require relay_signer signing
        </SorobanTip>
      </div>
    </div>
  );
}
