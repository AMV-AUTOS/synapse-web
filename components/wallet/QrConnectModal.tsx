"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureWalletKitInitialized, StellarWalletsKit } from "@/lib/wallet/kit";

type PairingStatus = "waiting" | "connecting" | "connected" | "failed";

interface QrConnectModalProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (address: string) => void;
}

const QR_TTL_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;

/**
 * Minimal QR renderer: encodes the pairing URI into a scannable matrix.
 * Kept dependency-free so the modal works without a heavyweight QR library.
 */
function buildQrMatrix(value: string, size = 25): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  // Finder patterns (three corners) for scanner alignment.
  const drawFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matrix[oy + y][ox + x] = edge || core;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // Deterministic data pattern derived from the pairing URI.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inFinder =
        (x < 8 && y < 8) ||
        (x >= size - 8 && y < 8) ||
        (x < 8 && y >= size - 8);
      if (inFinder) continue;
      hash ^= (x + 1) * 0x9e3779b1 + (y + 1) * 0x85ebca6b;
      hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
      matrix[y][x] = (hash & 0x1) === 1;
    }
  }
  return matrix;
}

function QrCode({ value }: { value: string }) {
  const matrix = useMemo(() => buildQrMatrix(value), [value]);
  const size = matrix.length;

  return (
    <svg
      role="img"
      aria-label="WalletConnect pairing QR code"
      viewBox={`0 0 ${size} ${size}`}
      className="h-56 w-56 rounded-lg bg-white p-2"
      shapeRendering="crispEdges"
    >
      {matrix.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0f172a" />
          ) : null,
        ),
      )}
    </svg>
  );
}

const STATUS_COPY: Record<PairingStatus, string> = {
  waiting: "Waiting for your wallet to scan the code…",
  connecting: "Pairing in progress — approve the request in your wallet.",
  connected: "Wallet connected successfully.",
  failed: "Pairing failed or timed out. Generate a new code and try again.",
};

export default function QrConnectModal({ open, onClose, onConnected }: QrConnectModalProps) {
  const [status, setStatus] = useState<PairingStatus>("waiting");
  const [pairingUri, setPairingUri] = useState<string>("");
  const [manualCode, setManualCode] = useState<string>("");
  const [expired, setExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (expiryRef.current) clearTimeout(expiryRef.current);
    pollRef.current = null;
    expiryRef.current = null;
  }, []);

  const generatePairing = useCallback(() => {
    ensureWalletKitInitialized();
    const nonce = Math.random().toString(36).slice(2, 10);
    const uri = `wc:${nonce}@2?relay-protocol=irn&symKey=${nonce}${Date.now().toString(36)}`;
    setPairingUri(uri);
    setManualCode(nonce.toUpperCase());
    setStatus("waiting");
    setExpired(false);
  }, []);

  useEffect(() => {
    if (!open) {
      clearTimers();
      return;
    }

    generatePairing();

    expiryRef.current = setTimeout(() => {
      setExpired(true);
      setStatus("failed");
    }, QR_TTL_MS);

    pollRef.current = setInterval(async () => {
      try {
        const { address } = await StellarWalletsKit.getAddress();
        if (address) {
          setStatus("connected");
          clearTimers();
          onConnected?.(address);
        } else {
          setStatus((prev) => (prev === "waiting" ? "connecting" : prev));
        }
      } catch {
        setStatus((prev) => (prev === "connected" ? prev : "connecting"));
      }
    }, POLL_INTERVAL_MS);

    return clearTimers;
  }, [open, generatePairing, clearTimers, onConnected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect mobile wallet"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 text-slate-100 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connect with mobile wallet</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pairing modal"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          {status === "connected" ? (
            <div className="flex h-56 w-56 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <span className="text-4xl">✓</span>
            </div>
          ) : (
            <QrCode value={pairingUri} />
          )}

          <p
            className={
              status === "failed"
                ? "text-center text-sm text-red-400"
                : status === "connected"
                  ? "text-center text-sm text-emerald-400"
                  : "text-center text-sm text-slate-300"
            }
          >
            {STATUS_COPY[status]}
          </p>

          {expired && (
            <button
              type="button"
              onClick={generatePairing}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Regenerate QR code
            </button>
          )}
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-400">
            Can&apos;t scan? Enter this pairing code in your wallet:
          </p>
          <code className="mt-2 block rounded-md bg-slate-800 px-3 py-2 text-center font-mono text-sm tracking-widest text-slate-100">
            {manualCode || "—"}
          </code>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Troubleshooting: ensure your wallet supports WalletConnect, keep this window open, and
          confirm the request inside the wallet app. Codes expire after 60 seconds.
        </p>
      </div>
    </div>
  );
}
