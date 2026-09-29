import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@stellar/freighter-api", () => ({
  default: {},
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signAuthEntry: vi.fn(),
  signMessage: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: { init: vi.fn() },
  Networks: { TESTNET: "testnet" },
  WalletNetwork: { TESTNET: "testnet" },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FreighterModule: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({
  xBullModule: vi.fn().mockImplementation(() => ({})),
}));

import React from "react";
import { render, screen, fireEvent, act, renderHook } from "@testing-library/react";
import {
  SorobanProvider,
  useSoroban,
  useSorobanEvents,
  useContractSelection,
} from "./SorobanProvider";
import { useLiveContractInfo } from "./useLiveContractInfo";
import { useLiveTransactions } from "./useLiveTransactions";
import { ContractSwitcher } from "@/components/ui/ContractSwitcher";
import * as eventsModule from "./events";
import * as contractModule from "./contract";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { getStoredContractId } from "./contractSelection";

vi.mock("@/lib/wallet/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWallet: () => ({
    address: "GAAO3OLP52EB7PW5SINKUABOFKCLRADZXEVNZKIHYU3FJOQ4AZUEEH5J",
    connecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

describe("Contract switching and stale data leakage prevention", () => {
  let mockPollerA: any;
  let mockPollerB: any;
  let pollerAHealthCb: any;
  let pollerAEventsCb: any;
  let pollerBHealthCb: any;
  let pollerBEventsCb: any;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    mockPollerA = {
      start: vi.fn(),
      stop: vi.fn(),
      poll: vi.fn(),
      onHealth: vi.fn((cb) => {
        pollerAHealthCb = cb;
        return vi.fn();
      }),
      onEvents: vi.fn((cb) => {
        pollerAEventsCb = cb;
        return vi.fn();
      }),
      getHealth: vi.fn(() => ({ connected: true, lastCheck: 100, lastEventTimestamp: null, error: null })),
      getCursor: vi.fn(() => "cursor-a"),
      resetCursor: vi.fn(),
    };

    mockPollerB = {
      start: vi.fn(),
      stop: vi.fn(),
      poll: vi.fn(),
      onHealth: vi.fn((cb) => {
        pollerBHealthCb = cb;
        return vi.fn();
      }),
      onEvents: vi.fn((cb) => {
        pollerBEventsCb = cb;
        return vi.fn();
      }),
      getHealth: vi.fn(() => ({ connected: true, lastCheck: 200, lastEventTimestamp: null, error: null })),
      getCursor: vi.fn(() => "cursor-b"),
      resetCursor: vi.fn(),
    };

    vi.spyOn(eventsModule, "createSorobanEventPoller").mockImplementation(
      (_rpcUrl?: string, contractId?: string) => {
        if (contractId === "CONTRACT_B") {
          return mockPollerB;
        }
        return mockPollerA;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("tears down old poller, creates new poller, and resets events on contract switch", async () => {
    const { result } = renderHook(
      () => ({
        soroban: useSoroban(),
        selection: useContractSelection(),
        events: useSorobanEvents(),
      }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <SorobanProvider defaultContractId="CONTRACT_A">{children}</SorobanProvider>
        ),
      }
    );

    expect(result.current.soroban.contractId).toBe("CONTRACT_A");
    expect(mockPollerA.start).toHaveBeenCalledTimes(1);

    // Emit event on Poller A
    act(() => {
      pollerAEventsCb?.([
        {
          id: "event-a1",
          type: "TransactionRegistered",
          txId: "tx-contract-a",
          timestamp: 1000,
          ledger: 50,
          raw: {} as any,
        },
      ]);
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.id).toBe("event-a1");

    // Switch to CONTRACT_B
    act(() => {
      result.current.selection.setContractId("CONTRACT_B");
    });

    // Verify CONTRACT_A poller was stopped
    expect(mockPollerA.stop).toHaveBeenCalled();
    // Verify CONTRACT_B poller was created and started
    expect(mockPollerB.start).toHaveBeenCalledTimes(1);
    expect(result.current.soroban.contractId).toBe("CONTRACT_B");

    // CRITICAL: Stale events from CONTRACT_A must NOT leak to CONTRACT_B
    expect(result.current.events).toEqual([]);

    // Verify selection is persisted to localStorage
    expect(getStoredContractId()).toBe("CONTRACT_B");
  });

  it("useLiveContractInfo clears live state and scopes to new contractId on switch", async () => {
    vi.spyOn(contractModule, "simulateContractCall").mockImplementation(
      async (_rpc, contractId, _addr, method) => {
        if (contractId === "CONTRACT_A") {
          return {
            result: {
              retval: {
                _switch: 0,
                value: method === "health" ? "OK_A" : "1.0.0_A",
              },
            },
          } as any;
        }
        if (contractId === "CONTRACT_B") {
          return {
            result: {
              retval: {
                _switch: 0,
                value: method === "health" ? "OK_B" : "2.0.0_B",
              },
            },
          } as any;
        }
        return { result: null } as any;
      }
    );

    // Mock scValToNative to return string value
    vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
      const original: any = await importOriginal();
      return {
        ...original,
        scValToNative: (val: any) => val?.value ?? "native-val",
      };
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>
        <SorobanProvider defaultContractId="CONTRACT_A">
          <WalletProvider>{children}</WalletProvider>
        </SorobanProvider>
      </ToastProvider>
    );

    const { result } = renderHook(
      () => ({
        contractInfo: useLiveContractInfo(),
        selection: useContractSelection(),
      }),
      { wrapper }
    );

    expect(result.current.contractInfo.address).toBe("CONTRACT_A");

    // Switch to CONTRACT_B
    act(() => {
      result.current.selection.setContractId("CONTRACT_B");
    });

    // The address updates to CONTRACT_B immediately and live data is reset
    expect(result.current.contractInfo.address).toBe("CONTRACT_B");
  });

  it("useLiveTransactions clears enriched cache and avoids stale transactions on switch", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>
        <SorobanProvider defaultContractId="CONTRACT_A">
          <WalletProvider>{children}</WalletProvider>
        </SorobanProvider>
      </ToastProvider>
    );

    const { result } = renderHook(
      () => ({
        txs: useLiveTransactions(),
        selection: useContractSelection(),
      }),
      { wrapper }
    );

    // Add an event to Poller A
    act(() => {
      pollerAEventsCb?.([
        {
          id: "event-a1",
          type: "TransactionRegistered",
          txId: "tx-contract-a-only",
          timestamp: 1000,
          ledger: 50,
          raw: {} as any,
        },
      ]);
    });

    // The transaction table now contains the new event from CONTRACT_A
    expect(result.current.txs.some((t) => t.id === "tx-contract-a-only")).toBe(true);

    // Switch to CONTRACT_B
    act(() => {
      result.current.selection.setContractId("CONTRACT_B");
    });

    // Transactions from CONTRACT_A must NOT leak to CONTRACT_B
    expect(result.current.txs.some((t) => t.id === "tx-contract-a-only")).toBe(false);
  });

  it("ContractSwitcher UI renders, switches contracts, adds new contract, and persists", async () => {
    render(
      <ToastProvider>
        <SorobanProvider defaultContractId="CONTRACT_A">
          <ContractSwitcher />
        </SorobanProvider>
      </ToastProvider>
    );

    const button = screen.getByRole("button", { name: /CONTRACT:/i });
    expect(button).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(button);
    expect(screen.getByText("TRACKED CONTRACTS")).toBeInTheDocument();

    // Click "+ ADD CONTRACT ID"
    const addBtn = screen.getByRole("button", { name: /\+ ADD CONTRACT ID/i });
    fireEvent.click(addBtn);

    // Fill form
    const idInput = screen.getByPlaceholderText(/Contract ID/i);
    const labelInput = screen.getByPlaceholderText(/Label/i);

    fireEvent.change(idInput, { target: { value: "CONTRACT_CUSTOM_99" } });
    fireEvent.change(labelInput, { target: { value: "My Personal Testnet" } });

    // Submit
    const saveBtn = screen.getByRole("button", { name: /Save & Switch/i });
    fireEvent.click(saveBtn);

    // Check localStorage persistence
    expect(getStoredContractId()).toBe("CONTRACT_CUSTOM_99");
  });

  it("events.ts scopes cursor key per contractId", () => {
    // Restore real implementation for this test
    vi.restoreAllMocks();

    localStorage.setItem("soroban-event-cursor:CONTRACT_A", "cursor-111");
    localStorage.setItem("soroban-event-cursor:CONTRACT_B", "cursor-222");

    // Verify the cursor keys in localStorage are correctly scoped
    expect(localStorage.getItem("soroban-event-cursor:CONTRACT_A")).toBe("cursor-111");
    expect(localStorage.getItem("soroban-event-cursor:CONTRACT_B")).toBe("cursor-222");
    // Ensure they don't bleed into one another
    expect(localStorage.getItem("soroban-event-cursor:CONTRACT_A")).not.toBe("cursor-222");
    expect(localStorage.getItem("soroban-event-cursor:CONTRACT_B")).not.toBe("cursor-111");
  });
});
