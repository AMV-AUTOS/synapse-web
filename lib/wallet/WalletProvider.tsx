"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ensureWalletKitInitialized,
  StellarWalletsKit,
  storeSelectedWalletId,
  clearSelectedWalletId,
  getStoredWalletId,
} from "./kit";

interface WalletContextValue {
  address: string | null;
  provider: string | null;
  network: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  provider: null,
  network: null,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncSession = useCallback(async () => {
    const { address: currentAddress } = await StellarWalletsKit.getAddress();
    setAddress(currentAddress);
    setProvider(StellarWalletsKit.selectedModule?.productId ?? null);
    try {
      const { network: currentNetwork } = await StellarWalletsKit.getNetwork();
      setNetwork(currentNetwork);
    } catch {
      setNetwork(null);
    }
  }, []);

  useEffect(() => {
    ensureWalletKitInitialized();
    if (!getStoredWalletId()) return;

    let cancelled = false;
    syncSession().catch(() => {
      if (!cancelled) clearSelectedWalletId();
    });
    return () => {
      cancelled = true;
    };
  }, [syncSession]);

  const connect = useCallback(async () => {
    ensureWalletKitInitialized();
    setConnecting(true);
    setError(null);
    try {
      await StellarWalletsKit.authModal({});
      await syncSession();
      storeSelectedWalletId(StellarWalletsKit.selectedModule.productId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, [syncSession]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // Some modules don't implement disconnect(); local state is cleared regardless.
    }
    clearSelectedWalletId();
    setAddress(null);
    setProvider(null);
    setNetwork(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, provider, network, connecting, error, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
