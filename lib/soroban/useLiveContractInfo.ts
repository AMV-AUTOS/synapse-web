"use client";
import { useEffect, useState } from "react";
import { scValToNative } from "@stellar/stellar-sdk";
import { simulateContractCall } from "./contract";
import { useSoroban } from "./SorobanProvider";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { MOCK_CONTRACT_INFO } from "@/lib/mock-data";
import type { ContractInfo } from "@/lib/types";

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

/**
 * Reads health() and version() from a real contract via read-only
 * simulation once a wallet is connected. Falls back to the mock baseline
 * (and stays there) when no contract is configured or no wallet is
 * connected.
 *
 * When contractId changes, previous live readings are wiped immediately
 * to prevent stale information from persisting into the newly selected contract.
 */
export function useLiveContractInfo(): ContractInfo {
  const { contractId } = useSoroban();
  const { address } = useWallet();
  const [live, setLive] = useState<Partial<ContractInfo>>({});

  useEffect(() => {
    // Reset live data immediately when contractId or address changes
    setLive({});
    if (!address || !contractId) return;
    let cancelled = false;

    async function readField(method: "health" | "version") {
      try {
        const simulated = await simulateContractCall(RPC_URL, contractId!, address!, method);
        if (cancelled || !simulated.result) return;
        const value = scValToNative(simulated.result.retval);
        if (typeof value === "string") {
          setLive((prev) => ({ ...prev, [method]: value }));
        }
      } catch {
        // Leave the mock value in place; this is best-effort.
      }
    }

    readField("health");
    readField("version");

    return () => {
      cancelled = true;
    };
  }, [address, contractId]);

  return {
    ...MOCK_CONTRACT_INFO,
    address: contractId ?? MOCK_CONTRACT_INFO.address,
    ...live,
  };
}
