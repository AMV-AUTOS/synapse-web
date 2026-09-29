import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStoredContractId,
  storeSelectedContractId,
  clearSelectedContractId,
  getStoredContracts,
  storeContracts,
  getDefaultContractId,
  getDefaultContracts,
  type DeployedContract,
} from "./contractSelection";

describe("contractSelection storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("returns undefined when no contract is stored and env is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "");
    expect(getStoredContractId()).toBeUndefined();
  });

  it("round-trips a stored contract id", () => {
    const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    storeSelectedContractId(contractId);
    expect(getStoredContractId()).toBe(contractId);
  });

  it("overwrites a previously stored contract id", () => {
    storeSelectedContractId("CONTRACT_A");
    storeSelectedContractId("CONTRACT_B");
    expect(getStoredContractId()).toBe("CONTRACT_B");
  });

  it("clears the stored contract id", () => {
    storeSelectedContractId("CONTRACT_A");
    clearSelectedContractId();
    expect(getStoredContractId()).toBeUndefined();
  });

  it("getDefaultContractId reads NEXT_PUBLIC_CONTRACT_ID from env", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "ENV_CONTRACT_ID");
    expect(getDefaultContractId()).toBe("ENV_CONTRACT_ID");
  });

  it("returns default contracts preset with env contract when present", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "ENV_CONTRACT_ID");
    const defaults = getDefaultContracts();
    expect(defaults).toEqual([{ id: "ENV_CONTRACT_ID", name: "Default (Env)" }]);
  });

  it("returns empty default contracts preset when env contract is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "");
    const defaults = getDefaultContracts();
    expect(defaults).toEqual([]);
  });

  it("stores and retrieves custom contracts", () => {
    const customContracts: DeployedContract[] = [
      { id: "CUSTOM_1", name: "My Testnet", isCustom: true },
      { id: "CUSTOM_2", name: "Shared Testnet", isCustom: true },
    ];
    storeContracts(customContracts);

    const retrieved = getStoredContracts();
    expect(retrieved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "CUSTOM_1", name: "My Testnet" }),
        expect.objectContaining({ id: "CUSTOM_2", name: "Shared Testnet" }),
      ])
    );
  });

  it("gracefully handles invalid JSON in stored contracts", () => {
    localStorage.setItem("synapse-tracked-contracts", "invalid-json{");
    expect(getStoredContracts()).toEqual(getDefaultContracts());
  });

  it("gracefully handles non-array stored contracts", () => {
    localStorage.setItem("synapse-tracked-contracts", JSON.stringify({ notAnArray: true }));
    expect(getStoredContracts()).toEqual(getDefaultContracts());
  });
});
