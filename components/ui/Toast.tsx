"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AMBER, BG2, DIM, MONO } from "@/lib/constants";
import { toastQueue, type QueuedToast, type ToastType } from "@/lib/toast/toastQueue";

export interface Toast {
  id: string;
  message: string;
  type?: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);

  useEffect(() => {
    return toastQueue.subscribe(setToasts);
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    toastQueue.push(message, type);
  }, []);

  const removeToast = useCallback((id: string) => {
    toastQueue.dismiss(id);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        aria-live="assertive"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          let typeColor = AMBER;
          let icon = "⬡";
          if (t.type === "success") {
            typeColor = "#66BB6A"; // COMPLETED green
            icon = "✓";
          } else if (t.type === "error") {
            typeColor = "#EF5350"; // FAILED red
            icon = "✗";
          } else if (t.type === "info") {
            typeColor = "#4FC3F7"; // PROCESSING blue
            icon = "ℹ";
          }

          return (
            <div
              key={t.id}
              className="animate-fade-in"
              style={{
                background: BG2,
                border: `1px solid ${typeColor}77`,
                boxShadow: `0 4px 12px rgba(0, 0, 0, 0.5), 0 0 8px ${typeColor}15`,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#fff",
                fontFamily: MONO,
                fontSize: 11,
                minWidth: 260,
                pointerEvents: "auto",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <span style={{ color: typeColor, fontWeight: 700 }}>{icon}</span>
                <span style={{ color: "#eee", wordBreak: "break-word" }}>{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontSize: 12,
                  marginLeft: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
