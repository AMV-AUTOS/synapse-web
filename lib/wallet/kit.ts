import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LedgerModule } from "@creit.tech/stellar-wallets-kit/modules/ledger";
import { getStoredWalletId, clearSelectedWalletId } from "./storage";

export { getStoredWalletId, storeSelectedWalletId, clearSelectedWalletId } from "./storage";

let initialized = false;

export function ensureWalletKitInitialized(): void {
  if (initialized || typeof window === "undefined") return;

  StellarWalletsKit.init({
    network: Networks.TESTNET,
    selectedWalletId: getStoredWalletId(),
    modules: [new FreighterModule(), new xBullModule(), new LedgerModule()],
  });

  initialized = true;
}

/**
 * Attempt a silent reconnection to a previously selected wallet.
 *
 * Returns the connected address when the wallet supports silent
 * reconnection and the user has already authorized this origin, or `null`
 * when no persisted selection exists, the wallet is no longer available, or
 * the wallet does not support silent reconnection (in which case no popup is
 * opened). A stale persisted selection is cleared so we don't keep retrying.
 */
export async function trySilentReconnect(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const storedId = getStoredWalletId();
  if (!storedId) return null;

  ensureWalletKitInitialized();

  try {
    const { address } = await StellarWalletsKit.getAddress();
    if (address) return address;
  } catch {
    // Silent reconnection is unsupported or was rejected without a prompt.
  }

  // The persisted wallet is no longer installed/available or cannot reconnect
  // silently; clear the stale selection instead of failing repeatedly.
  clearSelectedWalletId();
  return null;
}

export { StellarWalletsKit };

export type WalletNetwork = "TESTNET" | "PUBLIC" | "FUTURENET";

export interface AccountBalance {
  asset: string;
  balance: string;
}

export interface AccountBalancesResult {
  /** True when Horizon reports the account as unfunded/nonexistent (404). */
  notFunded: boolean;
  balances: AccountBalance[];
}

const HORIZON_URLS: Record<WalletNetwork, string> = {
  TESTNET: "https://horizon-testnet.stellar.org",
  PUBLIC: "https://horizon.stellar.org",
  FUTURENET: "https://horizon-futurenet.stellar.org",
};

/**
 * Fetch the balances for a single account directly from Horizon.
 *
 * Handles an unfunded/nonexistent account gracefully by returning
 * `notFunded: true` instead of throwing a raw error.
 */
export async function fetchAccountBalances(
  address: string,
  network: WalletNetwork = "TESTNET",
): Promise<AccountBalancesResult> {
  const base = HORIZON_URLS[network] ?? HORIZON_URLS.TESTNET;
  const res = await fetch(`${base}/accounts/${encodeURIComponent(address)}`);

  if (res.status === 404) {
    return { notFunded: true, balances: [] };
  }

  if (!res.ok) {
    throw new Error(`Failed to load account balances (${res.status})`);
  }

  const data = (await res.json()) as {
    balances?: Array<{
      asset_type: string;
      asset_code?: string;
      balance: string;
    }>;
  };

  const balances: AccountBalance[] = (data.balances ?? []).map((b) => ({
    asset: b.asset_type === "native" ? "XLM" : b.asset_code ?? b.asset_type,
    balance: b.balance,
  }));

  return { notFunded: false, balances };
}

/**
 * Estimated fee (in XLM) for a single upcoming transaction.
 * Base fee is 100 stroops per operation; assume a small op count.
 */
export const ESTIMATED_FEE_XLM = 0.00001;

/**
 * Returns true when the native XLM balance cannot cover the estimated fee.
 */
export function isLowBalance(
  balances: AccountBalance[],
  estimatedFeeXlm: number = ESTIMATED_FEE_XLM,
): boolean {
  const native = balances.find((b) => b.asset === "XLM");
  if (!native) return true;
  const amount = Number.parseFloat(native.balance);
  if (Number.isNaN(amount)) return true;
  return amount < estimatedFeeXlm;
}
