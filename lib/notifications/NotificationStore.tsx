"use client";
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useSorobanEvents } from "@/lib/soroban/SorobanProvider";
import { STATUS_META } from "@/lib/constants";
import type { TxStatus } from "@/lib/types";

export interface AppNotification {
  id: string;
  message: string;
  type: "registered" | "status_change";
  txId?: string;
  fromStatus?: string;
  toStatus?: string;
  timestamp: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

interface State {
  notifications: AppNotification[];
  seenEventIds: Set<string>;
}

type Action =
  | { type: "ADD"; notification: AppNotification; eventId: string }
  | { type: "MARK_ALL_READ" }
  | { type: "DISMISS"; id: string }
  | { type: "CLEAR_ALL" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD": {
      if (state.seenEventIds.has(action.eventId)) return state;
      const next = [action.notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      const seen = new Set<string>(state.seenEventIds);
      seen.add(action.eventId);
      return { notifications: next, seenEventIds: seen };
    }
    case "MARK_ALL_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };
    case "DISMISS":
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    case "CLEAR_ALL":
      return { ...state, notifications: [] };
    default:
      return state;
  }
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  dismiss: () => {},
  clearAll: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

function statusLabel(status?: string): string {
  if (!status) return status ?? "";
  const up = status.toUpperCase() as TxStatus;
  return STATUS_META[up]?.label ?? status;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    notifications: [],
    seenEventIds: new Set<string>(),
  });

  const events = useSorobanEvents();

  useEffect(() => {
    for (const event of events) {
      let notification: AppNotification | null = null;

      if (event.type === "TransactionRegistered" && event.txId) {
        notification = {
          id: event.id,
          message: `Transaction registered: ${event.txId.slice(0, 8)}…`,
          type: "registered",
          txId: event.txId,
          timestamp: event.timestamp,
          read: false,
        };
      } else if (event.type === "StatusChanged" && event.txId) {
        const from = statusLabel(event.fromStatus);
        const to = statusLabel(event.toStatus);
        notification = {
          id: event.id,
          message: `TX ${event.txId.slice(0, 8)}… ${from ? `${from} → ` : ""}${to}`,
          type: "status_change",
          txId: event.txId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          timestamp: event.timestamp,
          read: false,
        };
      }

      if (notification) {
        dispatch({ type: "ADD", notification, eventId: event.id });
      }
    }
  }, [events]);

  const markAllRead = useCallback(() => dispatch({ type: "MARK_ALL_READ" }), []);
  const dismiss = useCallback((id: string) => dispatch({ type: "DISMISS", id }), []);
  const clearAll = useCallback(() => dispatch({ type: "CLEAR_ALL" }), []);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications: state.notifications, unreadCount, markAllRead, dismiss, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
