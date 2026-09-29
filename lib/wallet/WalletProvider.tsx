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
  isLedgerModule,
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

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const BALANCE_CACHE_MS = 15_000;
const LOW_BALANCE_THRESHOLD_XLM = 1;

export interface WalletBalance {
  asset: string;
  balance: string;
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
  /** True while a Ledger device is awaiting on-device confirmation. */
  awaitingDeviceConfirmation: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  balances: WalletBalance[];
  balanceLoading: boolean;
  balanceError: string | null;
  accountFunded: boolean;
  lowBalance: boolean;
  refreshBalance: () => Promise<void>;
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
  awaitingDeviceConfirmation: false,
  connect: async () => {},
  disconnect: async () => {},
  balances: [],
  balanceLoading: false,
  balanceError: null,
  accountFunded: true,
  lowBalance: false,
  refreshBalance: async () => {},
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

/**
 * Ledger signing requires a physical on-device confirmation which can take a
 * while. We surface a distinct state so the UI can show "Confirm on your
 * Ledger device" instead of appearing frozen or hung.
 */
function isDeviceConfirmationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /reject|denied|cancel|declin/i.test(message);
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
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountFunded, setAccountFunded] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [awaitingDeviceConfirmation, setAwaitingDeviceConfirmation] = useState(false);

  useEffect(() => signingQueue.subscribe(setSigningQueueState), []);

  const enqueueSigning = useCallback(
    <T,>(request: Omit<SigningRequest<T>, "id"> & { id?: string }) =>
      signingQueue.enqueue<T>(request),
    [],
  );

  const cancelPendingSignings = useCallback(() => signingQueue.cancelPending(), []);

  const fetchBalance = useCallback(async (account: string, force = false) => {
    if (!force && Date.now() - lastFetchedAt < BALANCE_CACHE_MS) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const res = await fetch(`${HORIZON_URL}/accounts/${account}`);
      if (res.status === 404) {
        setBalances([]);
        setAccountFunded(false);
        setLastFetchedAt(Date.now());
        return;
      }
      if (!res.ok) throw new Error(`Horizon responded with ${res.status}`);
      const data = (await res.json()) as {
        balances?: Array<{ asset_type: string; asset_code?: string; balance: string }>;
      };
      const parsed: WalletBalance[] = (data.balances ?? []).map((b) => ({
        asset: b.asset_type === "native" ? "XLM" : b.asset_code ?? b.asset_type,
        balance: b.balance,
      }));
      setBalances(parsed);
      setAccountFunded(true);
      setLastFetchedAt(Date.now());
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Failed to load balance");
    } finally {
      setBalanceLoading(false);
    }
  }, [lastFetchedAt]);

  const refreshBalance = useCallback(async () => {
    if (address) await fetchBalance(address, true);
  }, [address, fetchBalance]);

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
    const storedWalletId = getStoredWalletId();
    if (!storedWalletId) return;

    // The persisted wallet may no longer be installed/available. If the kit
    // can't resolve it, clear the stale selection instead of retrying forever.
    const available = StellarWalletsKit.modules?.some(
      (m) => m.productId === storedWalletId,
    );
    if (!available) {
      clearSelectedWalletId();
      return;
    }

    let cancelled = false;
    StellarWalletsKit.getAddress()
      .then(({ address: restoredAddress }) => {
        if (!cancelled) setAddress(restoredAddress);
      })
      .catch(() => {
        // Silent reconnection isn't supported (or was rejected) by this wallet;
        // fall back to the disconnected state without prompting the user.
        if (!cancelled) clearSelectedWalletId();
      });
    return () => {
      cancelled = true;
    };
  }, [syncSession]);

  useEffect(() => {
    if (!address) {
      setBalances([]);
      setAccountFunded(true);
      setBalanceError(null);
      return;
    }
    void fetchBalance(address, true);
  }, [address, fetchBalance]);

  const connect = useCallback(async () => {
    ensureWalletKitInitialized();
    setConnecting(true);
    setError(null);
    setAwaitingDeviceConfirmation(false);
    try {
      await StellarWalletsKit.authModal({});
      const selectedModule = StellarWalletsKit.selectedModule;
      const ledger = isLedgerModule(selectedModule);
      if (ledger) setAwaitingDeviceConfirmation(true);
      const { address: connectedAddress } = await StellarWalletsKit.getAddress();
      setAddress(connectedAddress);
      storeSelectedWalletId(selectedModule.productId);
      await syncSession();
    } catch (err) {
      if (isDeviceConfirmationError(err)) {
        setError("Request rejected on your Ledger device. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to connect wallet");
      }
    } finally {
      setAwaitingDeviceConfirmation(false);
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
    setAwaitingDeviceConfirmation(false);
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

  const nativeBalance = balances.find((b) => b.asset === "XLM");
  const lowBalance =
    accountFunded &&
    nativeBalance !== undefined &&
    Number(nativeBalance.balance) < LOW_BALANCE_THRESHOLD_XLM;

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
        awaitingDeviceConfirmation,
        connect,
        disconnect,
        balances,
        balanceLoading,
        balanceError,
        accountFunded,
        lowBalance,
        refreshBalance,
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
