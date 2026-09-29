import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { NotificationProvider, useNotifications } from "./NotificationStore";
import type { NormalizedSorobanEvent } from "@/lib/soroban/events";
import type { ReactNode } from "react";

// Mock useSorobanEvents so we control the event stream
const mockEvents: NormalizedSorobanEvent[] = [];
vi.mock("@/lib/soroban/SorobanProvider", () => ({
  useSorobanEvents: () => mockEvents,
}));

function makeEvent(overrides: Partial<NormalizedSorobanEvent> = {}): NormalizedSorobanEvent {
  return {
    id: Math.random().toString(36).slice(2),
    type: "StatusChanged",
    txId: "tx-abc123",
    fromStatus: "PENDING",
    toStatus: "COMPLETED",
    timestamp: Date.now(),
    ledger: 1000,
    raw: {} as NormalizedSorobanEvent["raw"],
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

describe("NotificationStore reducer via provider", () => {
  beforeEach(() => {
    mockEvents.length = 0;
    vi.clearAllMocks();
  });

  it("starts with zero notifications", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("adds a StatusChanged event as a notification", () => {
    const event = makeEvent({ id: "evt-1" });
    mockEvents.push(event);

    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]!.txId).toBe("tx-abc123");
    expect(result.current.unreadCount).toBe(1);
  });

  it("adds a TransactionRegistered event as a notification", () => {
    mockEvents.push(
      makeEvent({ id: "evt-reg", type: "TransactionRegistered", fromStatus: undefined, toStatus: undefined })
    );
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.notifications[0]!.type).toBe("registered");
  });

  it("does not duplicate events with the same id", () => {
    const event = makeEvent({ id: "evt-dup" });
    mockEvents.push(event, event); // same id twice
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.notifications).toHaveLength(1);
  });

  it("markAllRead sets unreadCount to 0", () => {
    mockEvents.push(makeEvent({ id: "evt-2" }), makeEvent({ id: "evt-3" }));
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.unreadCount).toBe(2);
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications).toHaveLength(2); // still present, just read
  });

  it("dismiss removes a single notification by id", () => {
    mockEvents.push(makeEvent({ id: "evt-4" }), makeEvent({ id: "evt-5" }));
    const { result } = renderHook(() => useNotifications(), { wrapper });
    const idToRemove = result.current.notifications[0]!.id;
    act(() => result.current.dismiss(idToRemove));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]!.id).not.toBe(idToRemove);
  });

  it("clearAll empties the list", () => {
    mockEvents.push(makeEvent({ id: "evt-6" }), makeEvent({ id: "evt-7" }));
    const { result } = renderHook(() => useNotifications(), { wrapper });
    act(() => result.current.clearAll());
    expect(result.current.notifications).toHaveLength(0);
  });

  it("caps stored notifications at 50", () => {
    for (let i = 0; i < 60; i++) {
      mockEvents.push(makeEvent({ id: `evt-cap-${i}` }));
    }
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.notifications.length).toBeLessThanOrEqual(50);
  });

  it("unreadCount stays accurate after dismiss", () => {
    mockEvents.push(makeEvent({ id: "evt-8" }), makeEvent({ id: "evt-9" }));
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(result.current.unreadCount).toBe(2);
    act(() => result.current.dismiss(result.current.notifications[0]!.id));
    expect(result.current.unreadCount).toBe(1);
  });

  it("orders newest notifications first", () => {
    const earlier = makeEvent({ id: "early", timestamp: 1000 });
    const later = makeEvent({ id: "later", timestamp: 2000 });
    mockEvents.push(earlier, later);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    const first = result.current.notifications[0]!;
    const last = result.current.notifications[result.current.notifications.length - 1]!;
    expect(first.timestamp).toBeGreaterThanOrEqual(last.timestamp);
  });
});
