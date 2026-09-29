export interface DeployedContract {
  id: string;
  name: string;
  isCustom?: boolean;
}

const SELECTED_CONTRACT_KEY = "synapse-selected-contract-id";
const STORED_CONTRACTS_KEY = "synapse-tracked-contracts";

export function getDefaultContractId(): string | undefined {
  return process.env.NEXT_PUBLIC_CONTRACT_ID || undefined;
}

export function getDefaultContracts(): DeployedContract[] {
  const envId = getDefaultContractId();
  const presets: DeployedContract[] = [];

  if (envId) {
    presets.push({
      id: envId,
      name: "Default (Env)",
    });
  }

  return presets;
}

export function getStoredContractId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(SELECTED_CONTRACT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeSelectedContractId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELECTED_CONTRACT_KEY, id);
  } catch {}
}

export function clearSelectedContractId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SELECTED_CONTRACT_KEY);
  } catch {}
}

export function getStoredContracts(): DeployedContract[] {
  if (typeof window === "undefined") return getDefaultContracts();
  try {
    const raw = localStorage.getItem(STORED_CONTRACTS_KEY);
    if (!raw) return getDefaultContracts();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultContracts();

    const defaults = getDefaultContracts();
    const merged = [...defaults];
    for (const item of parsed) {
      if (item && typeof item.id === "string" && !merged.some((m) => m.id === item.id)) {
        merged.push({
          id: item.id,
          name: typeof item.name === "string" ? item.name : item.id.slice(0, 8),
          isCustom: true,
        });
      }
    }
    return merged;
  } catch {
    return getDefaultContracts();
  }
}

export function storeContracts(contracts: DeployedContract[]): void {
  if (typeof window === "undefined") return;
  try {
    const customOnly = contracts.filter((c) => c.isCustom);
    localStorage.setItem(STORED_CONTRACTS_KEY, JSON.stringify(customOnly));
  } catch {}
}
