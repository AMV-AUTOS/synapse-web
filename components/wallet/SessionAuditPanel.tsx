"use client";
import { useState } from "react";
import { AMBER, BG1, BORDER, DIM, MONO, STATUS_META } from "@/lib/constants";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useLiveContractInfo } from "@/lib/soroban/useLiveContractInfo";
import { shortId } from "@/lib/utils";

/**
 * Derives whether the active account is authorized to sign admin actions by
 * comparing it against the live on-chain `admin` / `relay_signer` values.
 * Pure so it can be unit-tested across account/admin/relay_signer combinations.
 */
export function deriveAuthorization(
  address: string | null,
  admin: string | null | undefined,
  relaySigner: string | null | undefined,
): { isAdmin: boolean; isRelaySigner: boolean; canSignAdminActions: boolean } {
  const isAdmin = !!address && !!admin && address === admin;
  const isRelaySigner = !!address && !!relaySigner && address === relaySigner;
  return { isAdmin, isRelaySigner, canSignAdminActions: isAdmin || isRelaySigner };
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "5px 0" }}>
      <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.12em" }}>{label}</span>
      <span style={{ fontSize: 10, color: color ?? "#ddd", fontFamily: MONO }}>{value}</span>
    </div>
  );
}

/**
 * Always-available summary of the connected wallet session: provider, active
 * account, active network, and the current authorization scope. Recomputes on
 * every render so account switches and contract-info refreshes never show stale
 * authorization info.
 */
export function SessionAuditPanel() {
  const [open, setOpen] = useState(false);
  const { address, provider, network } = useWallet();
  const { info } = useLiveContractInfo();

  if (!address) return null;

  const admin = info?.admin ?? null;
  const relaySigner = info?.relay_signer ?? null;
  const { isAdmin, isRelaySigner, canSignAdminActions } = deriveAuthorization(
    address,
    admin,
    relaySigner,
  );

  const scopeColor = canSignAdminActions ? AMBER : STATUS_META.COMPLETED.color;
  const scopeLabel = canSignAdminActions ? "CAN SIGN ADMIN ACTIONS" : "VIEW-ONLY";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Wallet session audit"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "transparent",
          border: `1px solid ${BORDER}`,
          color: scopeColor,
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: scopeColor,
            display: "inline-block",
            boxShadow: `0 0 6px 2px ${canSignAdminActions ? "rgba(245,166,35,0.55)" : STATUS_META.COMPLETED.glow}`,
          }}
        />
        {scopeLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Wallet session details"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 50,
            minWidth: 280,
            padding: "12px 16px",
            background: BG1,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: DIM,
              letterSpacing: "0.14em",
              marginBottom: 8,
              borderBottom: `1px solid ${BORDER}`,
              paddingBottom: 6,
            }}
          >
            WALLET SESSION
          </div>
          <Row label="PROVIDER" value={provider ?? "unknown"} />
          <Row label="ACCOUNT" value={shortId(address)} />
          <Row label="NETWORK" value={network ?? "unknown"} />
          <Row
            label="ADMIN"
            value={admin ? (isAdmin ? "matches active account" : shortId(admin)) : "unavailable"}
            color={isAdmin ? AMBER : undefined}
          />
          <Row
            label="RELAY SIGNER"
            value={
              relaySigner
                ? isRelaySigner
                  ? "matches active account"
                  : shortId(relaySigner)
                : "unavailable"
            }
            color={isRelaySigner ? AMBER : undefined}
          />
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${BORDER}`,
              fontSize: 10,
              fontFamily: MONO,
              color: scopeColor,
              letterSpacing: "0.06em",
            }}
          >
            {canSignAdminActions
              ? "This session can sign admin actions."
              : "This session is view-only; it cannot sign admin actions."}
          </div>
        </div>
      )}
    </div>
  );
}
