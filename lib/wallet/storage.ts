const SELECTED_WALLET_KEY = "synapse-selected-wallet-id";

export function getStoredWalletId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(SELECTED_WALLET_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeSelectedWalletId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELECTED_WALLET_KEY, id);
  } catch {}
}

export function clearSelectedWalletId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SELECTED_WALLET_KEY);
  } catch {}
}

/**
 * Resolve the persisted wallet selection against the set of currently
 * available wallet IDs. If the persisted wallet is no longer installed or
 * available, the stale selection is cleared so we don't repeatedly attempt
 * (and silently fail) a reconnect on every load.
 *
 * Returns the persisted wallet ID when it is still available, otherwise
 * `undefined`.
 */
export function resolveStoredWalletId(
  availableWalletIds: readonly string[],
): string | undefined {
  const storedId = getStoredWalletId();
  if (!storedId) return undefined;

  if (!availableWalletIds.includes(storedId)) {
    clearSelectedWalletId();
    return undefined;
  }

  return storedId;
}
