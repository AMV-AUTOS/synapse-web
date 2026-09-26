"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";

/**
 * Validates that a string is a well-formed Stellar public key (ed25519, G...).
 * Stellar public keys are 56 chars: a leading "G" followed by 55 base32 chars.
 */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address.trim());
}

/**
 * Entry point for starting a read-only "watch" session scoped to an arbitrary
 * Stellar address. No signing wallet is required; write actions are gated off
 * by the wallet context while in watch mode.
 */
export default function WatchAddressEntry() {
  const { mode, watchAddress, disconnect } = useWallet();
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = address.trim();
  const valid = isValidStellarAddress(trimmed);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError("Enter a valid Stellar public key (starts with G, 56 characters).");
      return;
    }
    setError(null);
    watchAddress(trimmed);
  }

  if (mode === "watch") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-amber-900">Watch-only mode</p>
            <p className="mt-1 break-all font-mono text-xs text-amber-800">
              {watchAddress ? trimmed : ""}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Read-only session. Write actions are disabled until you connect a
              signing wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Exit watch mode
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 text-sm"
    >
      <label
        htmlFor="watch-address"
        className="block font-medium text-gray-900"
      >
        Watch an address
      </label>
      <p className="mt-1 text-xs text-gray-500">
        View dashboard data for any Stellar address without connecting a
        wallet.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          id="watch-address"
          type="text"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            if (error) setError(null);
          }}
          placeholder="G..."
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!valid}
          className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Watch
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : null}
    </form>
  );
}
