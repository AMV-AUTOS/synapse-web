"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createSorobanEventPoller,
  type NormalizedSorobanEvent,
  type RpcHealth,
  type SorobanEventPoller,
} from "./events";
import {
  getStoredContractId,
  storeSelectedContractId,
  clearSelectedContractId,
  getStoredContracts,
  storeContracts,
  getDefaultContractId,
  type DeployedContract,
} from "./contractSelection";

export type RpcValidationErrorCode =
  | "unreachable"
  | "wrong-protocol"
  | "passphrase-mismatch"
  | "invalid-response";

export interface RpcValidationResult {
  ok: boolean;
  code: RpcValidationErrorCode | null;
  message: string;
  networkPassphrase: string | null;
  latestLedger: number | null;
}

interface SorobanContextValue {
  contractId: string | undefined;
  setContractId: (id: string | undefined) => void;
  availableContracts: DeployedContract[];
  addContract: (contract: DeployedContract) => void;
  removeContract: (id: string) => void;
  events: NormalizedSorobanEvent[];
  health: RpcHealth;
  poller: SorobanEventPoller | null;
  rpcUrl: string | undefined;
  customRpcUrl: string | null;
  validateEndpoint: (url: string) => Promise<RpcValidationResult>;
  saveCustomEndpoint: (url: string) => Promise<RpcValidationResult>;
  clearCustomEndpoint: () => void;
}

const SorobanContext = createContext<SorobanContextValue>({
  contractId: undefined,
  setContractId: () => {},
  availableContracts: [],
  addContract: () => {},
  removeContract: () => {},
  events: [],
  health: { connected: false, lastCheck: 0, lastEventTimestamp: null, error: null },
  poller: null,
  rpcUrl: undefined,
  customRpcUrl: null,
  validateEndpoint: async () => ({
    ok: false,
    code: "unreachable",
    message: "Soroban provider is not available.",
    networkPassphrase: null,
    latestLedger: null,
  }),
  saveCustomEndpoint: async () => ({
    ok: false,
    code: "unreachable",
    message: "Soroban provider is not available.",
    networkPassphrase: null,
    latestLedger: null,
  }),
  clearCustomEndpoint: () => {},
});

export function useSoroban() {
  return useContext(SorobanContext);
}

export interface SorobanProviderProps {
  children: ReactNode;
  rpcUrl?: string;
  contractId?: string;
  defaultContractId?: string;
  expectedNetworkPassphrase?: string;
}

const CUSTOM_RPC_STORAGE_KEY = "soroban.customRpcUrl";

function readStoredCustomRpcUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeEndpoint(raw: string): { url: string | null; error: RpcValidationResult | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      url: null,
      error: {
        ok: false,
        code: "unreachable",
        message: "Enter an RPC endpoint URL before testing the connection.",
        networkPassphrase: null,
        latestLedger: null,
      },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      url: null,
      error: {
        ok: false,
        code: "wrong-protocol",
        message: "That is not a valid URL. Use a full http(s) endpoint, e.g. https://rpc.example.org.",
        networkPassphrase: null,
        latestLedger: null,
      },
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      url: null,
      error: {
        ok: false,
        code: "wrong-protocol",
        message: `Unsupported protocol "${parsed.protocol}". Soroban RPC endpoints must use http or https.`,
        networkPassphrase: null,
        latestLedger: null,
      },
    };
  }

  return { url: parsed.toString(), error: null };
}

async function callGetHealth(url: string): Promise<RpcValidationResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: {} }),
    });
  } catch {
    return {
      ok: false,
      code: "unreachable",
      message: "Could not reach the endpoint. Check the URL, that the node is running, and CORS settings.",
      networkPassphrase: null,
      latestLedger: null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "unreachable",
      message: `Endpoint responded with HTTP ${response.status}. It may not be a Soroban RPC server.`,
      networkPassphrase: null,
      latestLedger: null,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      code: "invalid-response",
      message: "Endpoint did not return valid JSON-RPC. Confirm it is a Soroban RPC server.",
      networkPassphrase: null,
      latestLedger: null,
    };
  }

  const result = (payload as { result?: Record<string, unknown> } | null)?.result;
  if (!result || typeof result !== "object") {
    const rpcError = (payload as { error?: { message?: string } } | null)?.error;
    return {
      ok: false,
      code: "invalid-response",
      message: rpcError?.message
        ? `RPC error: ${rpcError.message}`
        : "Endpoint did not return a getHealth result. It may not be a Soroban RPC server.",
      networkPassphrase: null,
      latestLedger: null,
    };
  }

  const status = typeof result.status === "string" ? result.status : null;
  if (status && status !== "healthy") {
    return {
      ok: false,
      code: "unreachable",
      message: `Endpoint reported status "${status}". The node is not healthy.`,
      networkPassphrase: null,
      latestLedger: null,
    };
  }

  const networkPassphrase =
    typeof result.networkPassphrase === "string" ? result.networkPassphrase : null;
  const latestLedger = typeof result.latestLedger === "number" ? result.latestLedger : null;

  return {
    ok: true,
    code: null,
    message: "Connection successful.",
    networkPassphrase,
    latestLedger,
  };
}

export function SorobanProvider({
  children,
  rpcUrl,
  contractId: propContractId,
  defaultContractId,
  expectedNetworkPassphrase,
}: SorobanProviderProps) {
  const [activeContractId, setActiveContractId] = useState<string | undefined>(() => {
    if (propContractId !== undefined) return propContractId;
    const stored = getStoredContractId();
    if (stored !== undefined) return stored;
    return defaultContractId ?? getDefaultContractId();
  });

  const [availableContracts, setAvailableContracts] = useState<DeployedContract[]>(() => {
    return getStoredContracts();
  });

  const [events, setEvents] = useState<NormalizedSorobanEvent[]>([]);
  const [health, setHealth] = useState<RpcHealth>({
    connected: false,
    lastCheck: 0,
    lastEventTimestamp: null,
    error: null,
  });
  const [customRpcUrl, setCustomRpcUrl] = useState<string | null>(null);

  useEffect(() => {
    setCustomRpcUrl(readStoredCustomRpcUrl());
  }, []);

  const activeRpcUrl = customRpcUrl ?? rpcUrl;

  const [poller, setPoller] = useState<SorobanEventPoller | null>(null);

  useEffect(() => {
    const p = createSorobanEventPoller(activeRpcUrl, contractId);
    setPoller(p);
    return () => {
      p.stop();
    };
  }, [activeRpcUrl, contractId]);

  // Sync if propContractId is explicitly passed and changes
  useEffect(() => {
    if (propContractId !== undefined) {
      setActiveContractId(propContractId);
    }
  }, [propContractId]);

  const setContractId = useCallback((id: string | undefined) => {
    const trimmed = id?.trim() || undefined;
    setActiveContractId(trimmed);
    if (trimmed) {
      storeSelectedContractId(trimmed);
    } else {
      clearSelectedContractId();
    }
  }, []);

  const addContract = useCallback((contract: DeployedContract) => {
    setAvailableContracts((prev) => {
      const existing = prev.find((c) => c.id === contract.id);
      let updated: DeployedContract[];
      if (existing) {
        updated = prev.map((c) => (c.id === contract.id ? { ...c, ...contract } : c));
      } else {
        updated = [...prev, { ...contract, isCustom: true }];
      }
      storeContracts(updated);
      return updated;
    });
  }, []);

  const removeContract = useCallback(
    (id: string) => {
      setAvailableContracts((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        storeContracts(updated);
        return updated;
      });

      if (activeContractId === id) {
        const fallback = getDefaultContractId();
        setContractId(fallback);
      }
    },
    [activeContractId, setContractId]
  );

  // Tear down and re-establish the poller cleanly on contractId / rpcUrl change
  useEffect(() => {
    // Clear previous events and health to prevent stale leakage
    setEvents([]);
    setHealth({
      connected: false,
      lastCheck: 0,
      lastEventTimestamp: null,
      error: null,
    });

    const newPoller = createSorobanEventPoller(rpcUrl, activeContractId);
    setPoller(newPoller);

    const unsubHealth = newPoller.onHealth(setHealth);
    const unsubEvents = newPoller.onEvents((newEvents) => {
      setEvents((prev) => {
        const combined = [...newEvents, ...prev];
        return combined.slice(0, 200);
      });
    });

    newPoller.start();

    return () => {
      newPoller.stop();
      unsubHealth();
      unsubEvents();
    };
  }, [rpcUrl, activeContractId]);

  // Pause adaptive polling while the tab is hidden and resume with an
  // immediate catch-up poll on visibility return so no events are missed.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        poller.pause();
      } else {
        poller.resume();
      }
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [poller]);

  const validateEndpoint = useCallback(
    async (url: string): Promise<RpcValidationResult> => {
      const { url: normalized, error } = normalizeEndpoint(url);
      if (error || !normalized) {
        return error as RpcValidationResult;
      }

      const result = await callGetHealth(normalized);
      if (!result.ok) {
        return result;
      }

      if (
        expectedNetworkPassphrase &&
        result.networkPassphrase &&
        result.networkPassphrase !== expectedNetworkPassphrase
      ) {
        return {
          ok: false,
          code: "passphrase-mismatch",
          message: `Network passphrase mismatch. Expected "${expectedNetworkPassphrase}" but the endpoint reports "${result.networkPassphrase}".`,
          networkPassphrase: result.networkPassphrase,
          latestLedger: result.latestLedger,
        };
      }

      return result;
    },
    [expectedNetworkPassphrase],
  );

  return (
    <SorobanContext.Provider
      value={{
        contractId: activeContractId,
        setContractId,
        availableContracts,
        addContract,
        removeContract,
        events,
        health,
        poller,
      }}
    >
      {children}
    </SorobanContext.Provider>
  );

  const saveCustomEndpoint = useCallback(
    async (url: string): Promise<RpcValidationResult> => {
      const result = await validateEndpoint(url);
      if (!result.ok) {
        return result;
      }

      const { url: normalized } = normalizeEndpoint(url);
      if (!normalized) {
        return result;
      }

      try {
        window.localStorage.setItem(CUSTOM_RPC_STORAGE_KEY, normalized);
      } catch {
        // Persisting is best-effort; activation still proceeds for this session.
      }
      setCustomRpcUrl(normalized);
      return result;
    },
    [validateEndpoint],
  );

  const clearCustomEndpoint = useCallback(() => {
    try {
      window.localStorage.removeItem(CUSTOM_RPC_STORAGE_KEY);
    } catch {
      // Ignore storage failures; in-memory state is still reset below.
    }
    setCustomRpcUrl(null);
  }, []);

  const value = useMemo<SorobanContextValue>(
    () => ({
      events,
      health,
      poller,
      rpcUrl: activeRpcUrl,
      customRpcUrl,
      validateEndpoint,
      saveCustomEndpoint,
      clearCustomEndpoint,
    }),
    [events, health, poller, activeRpcUrl, customRpcUrl, validateEndpoint, saveCustomEndpoint, clearCustomEndpoint],
  );

  return <SorobanContext.Provider value={value}>{children}</SorobanContext.Provider>;
}

export function useSorobanEvents() {
  return useSoroban().events;
}

export function useSorobanHealth() {
  return useSoroban().health;
}

export function useSorobanRpcConfig() {
  const { rpcUrl, customRpcUrl, validateEndpoint, saveCustomEndpoint, clearCustomEndpoint } =
    useSoroban();
  return { rpcUrl, customRpcUrl, validateEndpoint, saveCustomEndpoint, clearCustomEndpoint };
}

export function useContractSelection() {
  const { contractId, setContractId, availableContracts, addContract, removeContract } =
    useSoroban();
  return { contractId, setContractId, availableContracts, addContract, removeContract };
}
}
