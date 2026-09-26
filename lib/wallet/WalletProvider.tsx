"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ensureWalletKitInitialized,
  StellarWalletsKit,
  storeSelectedWalletId,
  clearSelectedWalletId,
  getStoredWalletId,
} from "./kit";
import {
  signingQueue,
  EMPTY_SIGNING_QUEUE_STATE,
  type SigningQueueState,
  type SigningRequest,
} from "./signingQueue";

export type QrPairingStatus = "idle" | "waiting" | "connecting" | "connected" | "failed";

export type WalletMode = "signed" | "watch" | "disconnected";

const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(value: string): boolean {
  return STELLAR_PUBLIC_KEY_REGEX.test(value.trim());
}

interface WalletContextValue {
  address: string | null;
  provider: string | null;
  network: string | null;
  mode: WalletMode;
  isWatchOnly: boolean;
  canSign: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  watchAddress: (address: string) => boolean;
  qrPairingUri: string | null;
  qrPairingStatus: QrPairingStatus;
  qrPairingError: string | null;
  startQrPairing: () => Promise<void>;
  cancelQrPairing: () => void;
  /** Enqueue a wallet-signature request; serialized app-wide, FIFO. */
  enqueueSigning: <T>(request: Omit<SigningRequest<T>, "id"> & { id?: string }) => Promise<T>;
  /** Cancel all signing requests that have not started yet. */
  cancelPendingSignings: () => number;
  /** Current signing-queue progress ("N of M") and per-item status. */
  signingQueueState: SigningQueueState;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  provider: null,
  network: null,
  mode: "disconnected",
  isWatchOnly: false,
  canSign: false,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: async () => {},
  watchAddress: () => false,
  qrPairingUri: null,
  qrPairingStatus: "idle",
  qrPairingError: null,
  startQrPairing: async () => {},
  cancelQrPairing: () => {},
  enqueueSigning: () => Promise.reject(new Error("WalletProvider is not mounted")),
  cancelPendingSignings: () => 0,
  signingQueueState: EMPTY_SIGNING_QUEUE_STATE,
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [mode, setMode] = useState<WalletMode>("disconnected");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrPairingUri, setQrPairingUri] = useState<string | null>(null);
  const [qrPairingStatus, setQrPairingStatus] = useState<QrPairingStatus>("idle");
  const [qrPairingError, setQrPairingError] = useState<string | null>(null);
  const [signingQueueState, setSigningQueueState] = useState<SigningQueueState>(
    EMPTY_SIGNING_QUEUE_STATE,
  );

  useEffect(() => signingQueue.subscribe(setSigningQueueState), []);

  const enqueueSigning = useCallback(
    <T,>(request: Omit<SigningRequest<T>, "id"> & { id?: string }) =>
      signingQueue.enqueue<T>(request),
    [],
  );

  const cancelPendingSignings = useCallback(() => signingQueue.cancelPending(), []);

  const syncSession = useCallback(async () => {
    const { address: currentAddress } = await StellarWalletsKit.getAddress();
    setAddress(currentAddress);
    setProvider(StellarWalletsKit.selectedModule?.productId ?? null);
    setMode(currentAddress ? "signed" : "disconnected");
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
    setMode("disconnected");
    setQrPairingUri(null);
    setQrPairingStatus("idle");
    setQrPairingError(null);
  }, []);

  const watchAddress = useCallback((nextAddress: string) => {
    const trimmed = nextAddress.trim();
    if (!isValidStellarAddress(trimmed)) {
      setError("Enter a valid Stellar public key (starts with G, 56 characters).");
      return false;
    }
    setError(null);
    setAddress(trimmed);
    setProvider(null);
    setNetwork(null);
    setMode("watch");
    setQrPairingUri(null);
    setQrPairingStatus("idle");
    setQrPairingError(null);
    return true;
  }, []);

  const startQrPairing = useCallback(async () => {
    ensureWalletKitInitialized();
    setQrPairingError(null);
    setQrPairingStatus("waiting");
    try {
      const kit = StellarWalletsKit as unknown as {
        getQrPairingUri?: () => Promise<string> | string;
      };
      const uri = await kit.getQrPairingUri?.();
      if (!uri) {
        setQrPairingStatus("failed");
        setQrPairingError("QR pairing is not supported by the selected wallet module.");
        return;
      }
      setQrPairingUri(uri);
      setQrPairingStatus("connecting");
      await syncSession();
      storeSelectedWalletId(StellarWalletsKit.selectedModule.productId);
      setQrPairingStatus("connected");
    } catch (err) {
      setQrPairingStatus("failed");
      setQrPairingError(err instanceof Error ? err.message : "QR pairing failed");
    }
  }, [syncSession]);

  const cancelQrPairing = useCallback(() => {
    setQrPairingUri(null);
    setQrPairingStatus("idle");
    setQrPairingError(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        provider,
        network,
        mode,
        isWatchOnly: mode === "watch",
        canSign: mode === "signed",
        connecting,
        error,
        connect,
        disconnect,
        watchAddress,
        qrPairingUri,
        qrPairingStatus,
        qrPairingError,
        startQrPairing,
        cancelQrPairing,
        enqueueSigning,
        cancelPendingSignings,
        signingQueueState,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
