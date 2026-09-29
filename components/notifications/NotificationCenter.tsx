"use client";
import { useRef, useState, useEffect } from "react";
import { useNotifications } from "@/lib/notifications/NotificationStore";
import { STATUS_META } from "@/lib/constants";
import { AMBER, BG2, BG3, BORDER, DIM, MONO } from "@/lib/constants";
import type { TxStatus } from "@/lib/types";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusColor(status?: string): string {
  if (!status) return AMBER;
  const up = status.toUpperCase() as TxStatus;
  return STATUS_META[up]?.color ?? AMBER;
}

export function NotificationCenter() {
  const { notifications, unreadCount, markAllRead, dismiss, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  function toggle() {
    if (!open) markAllRead();
    setOpen((v) => !v);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          position: "relative",
          background: "none",
          border: `1px solid ${open ? AMBER : BORDER}`,
          color: open ? AMBER : DIM,
          cursor: "pointer",
          padding: "5px 10px",
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 1,
          transition: "color 0.15s, border-color 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.borderColor = AMBER;
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.color = DIM;
            e.currentTarget.style.borderColor = BORDER;
          }
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            data-testid="unread-badge"
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 16,
              height: 16,
              fontSize: 8,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: MONO,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notification center"
          data-testid="notification-panel"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            background: BG2,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            maxHeight: 420,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ fontSize: 9, letterSpacing: "0.14em", color: DIM, fontFamily: MONO }}>
              NOTIFICATIONS
            </span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  padding: 0,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}
              >
                CLEAR ALL
              </button>
            )}
          </div>

          {/* List */}
          <div
            role="list"
            style={{ overflowY: "auto", flex: 1 }}
            aria-label="Notification list"
          >
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "32px 14px",
                  textAlign: "center",
                  color: DIM,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                }}
                data-testid="empty-notifications"
              >
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="listitem"
                  data-testid="notification-item"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom: `1px solid ${BORDER}`,
                    background: n.read ? "transparent" : "rgba(245,166,35,0.04)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: statusColor(n.toStatus),
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#eee",
                        fontFamily: MONO,
                        wordBreak: "break-word",
                        marginBottom: 3,
                      }}
                    >
                      {n.message}
                    </div>
                    <div style={{ fontSize: 8, color: DIM, fontFamily: MONO, letterSpacing: "0.08em" }}>
                      {timeAgo(n.timestamp)}
                    </div>
                  </div>
                  <button
                    onClick={() => dismiss(n.id)}
                    aria-label="Dismiss notification"
                    style={{
                      background: "none",
                      border: "none",
                      color: DIM,
                      cursor: "pointer",
                      fontSize: 11,
                      padding: 2,
                      flexShrink: 0,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${BORDER}`,
              background: BG3,
            }}
          >
            <span style={{ fontSize: 8, color: DIM, fontFamily: MONO, letterSpacing: "0.08em" }}>
              Local session only · last {Math.min(notifications.length, 50)} events
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
