"use client";
import { useState } from "react";
import { scValToNative } from "@stellar/stellar-sdk";
import { Panel } from "@/components/ui/Panel";
import { Field } from "@/components/ui/Field";
import { SorobanTip } from "@/components/ui/SorobanTip";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSoroban } from "@/lib/soroban/SorobanProvider";
import { addressArg, invokeContract, simulateContractCall } from "@/lib/soroban/contract";
import { shortId } from "@/lib/utils";
import { AMBER, BORDER, DIM, MONO, STATUS_META } from "@/lib/constants";

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldDef {
  label: string;
  key: string;
  placeholder: string;
}

interface ConfirmConfig {
  title: string;
  message: string;
  /** If set, user must retype this exact value before confirming */
  retypeKey?: string;
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// AdminCard
// ---------------------------------------------------------------------------

function AdminCard({
  title,
  tip,
  fields,
  onSubmit,
  btnLabel,
  btnColor = AMBER,
  confirm,
  disabled = false,
}: {
  title: string;
  tip: string;
  fields: FieldDef[];
  onSubmit: (vals: Record<string, string>) => void | Promise<void>;
  btnLabel: string;
  btnColor?: string;
  confirm?: ConfirmConfig;
  disabled?: boolean;
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""]))
  );
  const [pendingVals, setPendingVals] = useState<Record<string, string> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(v: Record<string, string>) {
    setSubmitting(true);
    try {
      await onSubmit(v);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClick() {
    if (disabled) return;
    if (confirm) {
      setPendingVals({ ...vals });
    } else {
      submit(vals);
    }
  }

  function handleConfirm() {
    if (pendingVals) submit(pendingVals);
    setPendingVals(null);
  }

  const retypeValue =
    confirm?.retypeKey && pendingVals ? pendingVals[confirm.retypeKey] : undefined;

  return (
    <>
      <Panel title={title}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              value={vals[f.key] ?? ""}
              onChange={(v) => setVals((p) => ({ ...p, [f.key]: v }))}
              placeholder={f.placeholder}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <ActionButton
            label={submitting ? "SUBMITTING…" : btnLabel}
            color={btnColor}
            onClick={handleClick}
            disabled={submitting || disabled}
          />
        </div>
        <SorobanTip>{tip}</SorobanTip>
      </Panel>

      {pendingVals && confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          retypeValue={retypeValue}
          retypePlaceholder={retypeValue ? `paste or type: ${retypeValue}` : undefined}
          accentColor={confirm.accentColor ?? btnColor}
          onConfirm={handleConfirm}
          onCancel={() => setPendingVals(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// AdminTab
// ---------------------------------------------------------------------------

export function AdminTab() {
  const { address, connect, mode } = useWallet();
  const { contractId } = useSoroban();
  const { toast } = useToast();

  const isWatchOnly = mode === "watch";

  async function runAdminCall(method: string, addresses: string[]) {
    if (isWatchOnly) {
      toast("Watch-only mode: connect a signing wallet to submit admin transactions", "error");
      return;
    }
    if (!contractId) {
      toast("No contract ID is currently selected or configured", "error");
      return;
    }
      return;
    }
    if (!address) {
      toast("Connect a wallet before submitting admin transactions", "error");
      await connect();
      return;
    }
    if (addresses.some((a) => !a.trim())) {
      toast("All address fields are required", "error");
      return;
    }
    try {
      const args = addresses.map(addressArg);
      const result = await invokeContract(RPC_URL, contractId, address, method, args);
      toast(
        `${method}() ${result.status === "SUCCESS" ? "succeeded" : "failed"} · tx ${shortId(result.hash)}`,
        result.status === "SUCCESS" ? "success" : "error"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : `${method}() failed`, "error");
    }
  }

  async function runDiagnostic(method: string) {
    if (!contractId) {
      toast("No contract ID is currently selected or configured", "error");
      return;
    }
    if (!address) {
      toast("Connect a wallet to run read-only diagnostics", "error");
      await connect();
      return;
    }
    try {
      const simulated = await simulateContractCall(RPC_URL, contractId, address, method);
      const value = simulated.result ? scValToNative(simulated.result.retval) : undefined;
      toast(`${method}() → ${JSON.stringify(value)}`, "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : `${method}() failed`, "error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} className="animate-fade-in">
      {/* Warning banner */}
      <div
        style={{
          background: "rgba(239,83,80,0.06)",
          border: "1px solid rgba(239,83,80,0.3)",
          padding: "10px 16px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#EF5350",
            fontFamily: MONO,
            letterSpacing: "0.06em",
          }}
        >
          ⚠ PRIVILEGED ZONE — all operations here require admin keypair authorization
        </span>
      </div>

      {/* Watch-only notice */}
      {isWatchOnly && (
        <div
          style={{
            background: "rgba(255,193,7,0.06)",
            border: `1px solid ${AMBER}`,
            padding: "10px 16px",
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: AMBER,
              fontFamily: MONO,
              letterSpacing: "0.06em",
            }}
          >
            👁 WATCH-ONLY MODE — admin write actions are disabled. Connect a signing wallet to
            perform privileged operations.
          </span>
        </div>
      )}

      {/* Initialize */}
      <AdminCard
        title="INITIALIZE CONTRACT"
        tip="initialize(admin: Address, relay_signer: Address) — one-time bootstrap; reverts if already initialized"
        fields={[
          { label: "admin", key: "admin", placeholder: "G… admin address" },
          { label: "relay_signer", key: "relay_signer", placeholder: "G… relay signer address" },
        ]}
        btnLabel="INITIALIZE →"
        disabled={isWatchOnly}
        onSubmit={(v) => runAdminCall("initialize", [v.admin ?? "", v.relay_signer ?? ""])}
      />

      {/* Transfer admin — requires retype confirmation */}
      <AdminCard
        title="TRANSFER ADMIN"
        tip="transfer_admin(new_admin: Address) — caller must be current admin; irreversible if wrong address"
        fields={[{ label: "new_admin", key: "new_admin", placeholder: "G… new admin address" }]}
        btnLabel="TRANSFER →"
        btnColor={STATUS_META.FAILED.color}
        disabled={isWatchOnly}
        confirm={{
          title: "TRANSFER ADMIN — IRREVERSIBLE",
          message:
            "You are transferring admin rights to a new address. " +
            "If the address is wrong you will permanently lose access to all admin functions. " +
            "Retype the destination address exactly to continue.",
          retypeKey: "new_admin",
          accentColor: STATUS_META.FAILED.color,
        }}
        onSubmit={(v) => runAdminCall("transfer_admin", [v.new_admin ?? ""])}
      />

      {/* Set relay signer — gated confirm (no retype required) */}
      <AdminCard
        title="SET RELAY SIGNER"
        tip="set_relay_signer(new_signer: Address) — caller must be current admin"
        fields={[
          { label: "new_signer", key: "new_signer", placeholder: "G… new relay signer address" },
        ]}
        btnLabel="SET SIGNER →"
        btnColor={STATUS_META.PROCESSING.color}
        disabled={isWatchOnly}
        confirm={{
          title: "SET RELAY SIGNER",
          message:
            "This updates the relay signer authorized to submit relayed transactions. " +
            "Confirm the new signer address is correct before continuing.",
          accentColor: STATUS_META.PROCESSING.color,
        }}
        onSubmit={(v) => runAdminCall("set_relay_signer", [v.new_signer ?? ""])}
      />

      {/* Diagnostics — read-only, allowed in watch mode */}
      <Panel title="DIAGNOSTICS">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ActionButton
            label="PING →"
            color={DIM}
            onClick={() => runDiagnostic("ping")}
          />
          <ActionButton
            label="GET ADMIN →"
            color={DIM}
            onClick={() => runDiagnostic("get_admin")}
          />
        </div>
        <SorobanTip>
          Read-only simulations. These do not require signing and remain available in watch-only
          mode.
        </SorobanTip>
      </Panel>
    </div>
  );
}
