import { describe, it, expect } from "vitest";
import { scValToNative, Address, nativeToScVal } from "@stellar/stellar-sdk";
import { addressArg, stringArg, structArg } from "./args";
import { ABI_ENDPOINTS } from "../constants";
import { decodeCallArgs, decodeArgValue } from "./args";

const TEST_ADDRESS = "GAAO3OLP52EB7PW5SINKUABOFKCLRADZXEVNZKIHYU3FJOQ4AZUEEH5J";

describe("addressArg", () => {
  it("encodes a G... address as an ScVal address that round-trips", () => {
    const scVal = addressArg(TEST_ADDRESS);
    expect(scValToNative(scVal)).toBe(TEST_ADDRESS);
  });

  it("throws for an invalid address string", () => {
    expect(() => addressArg("not-an-address")).toThrow();
  });

  it("matches Address.fromString for the same key", () => {
    const scVal = addressArg(TEST_ADDRESS);
    expect(scVal.toXDR("base64")).toBe(Address.fromString(TEST_ADDRESS).toScVal().toXDR("base64"));
  });
});

describe("stringArg", () => {
  it("encodes a plain string that round-trips", () => {
    const scVal = stringArg("550e8400-e29b-41d4-a716-446655440000");
    expect(scValToNative(scVal)).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("handles an empty string", () => {
    expect(scValToNative(stringArg(""))).toBe("");
  });
});

describe("structArg", () => {
  it("encodes a plain object as a map that round-trips", () => {
    const payload = {
      tx_id: "abc-123",
      callback_url: "https://example.com/cb",
      secret: "hmac-secret",
    };
    const scVal = structArg(payload);
    expect(scValToNative(scVal)).toEqual(payload);
  });
});

describe("decodeArgValue", () => {
  it("decodes an address ScVal to its G... string", () => {
    expect(decodeArgValue(addressArg(TEST_ADDRESS))).toBe(TEST_ADDRESS);
  });

  it("decodes a string ScVal", () => {
    expect(decodeArgValue(stringArg("hello"))).toBe("hello");
  });

  it("decodes a numeric ScVal", () => {
    expect(decodeArgValue(nativeToScVal(42, { type: "u32" }))).toBe(42);
  });

  it("decodes a boolean ScVal", () => {
    expect(decodeArgValue(nativeToScVal(true, { type: "bool" }))).toBe(true);
  });

  it("decodes a struct/map ScVal via structArg round-trip", () => {
    const payload = { tx_id: "abc-123", callback_url: "https://example.com/cb" };
    expect(decodeArgValue(structArg(payload))).toEqual(payload);
  });
});

describe("decodeCallArgs", () => {
  it("labels arguments using ABI_ENDPOINTS parameter metadata", () => {
    const entry = ABI_ENDPOINTS.find((e) => e.params && e.params.length > 0);
    expect(entry).toBeDefined();
    const args = entry!.params!.map((p) => {
      if (p.type === "address") return addressArg(TEST_ADDRESS);
      if (p.type === "string") return stringArg("value");
      if (p.type === "struct") return structArg({ tx_id: "abc-123" });
      return nativeToScVal(1, { type: "u32" });
    });
    const decoded = decodeCallArgs(entry!.name, args);
    expect(decoded.covered).toBe(true);
    expect(decoded.args).toHaveLength(entry!.params!.length);
    decoded.args.forEach((arg, i) => {
      expect(arg.label).toBe(entry!.params![i].name);
      expect(arg.type).toBe(entry!.params![i].type);
      expect(arg.raw).toBeDefined();
    });
  });

  it("falls back to a clearly-marked raw view for unknown entrypoints", () => {
    const decoded = decodeCallArgs("unknown_entrypoint", [addressArg(TEST_ADDRESS)]);
    expect(decoded.covered).toBe(false);
    expect(decoded.args).toHaveLength(1);
    expect(decoded.args[0].label).toMatch(/raw|undecoded/i);
    expect(decoded.args[0].raw).toBeDefined();
  });

  it("falls back to raw for arguments beyond documented ABI params", () => {
    const entry = ABI_ENDPOINTS.find((e) => e.params && e.params.length > 0);
    expect(entry).toBeDefined();
    const args = [
      ...entry!.params!.map(() => nativeToScVal(1, { type: "u32" })),
      addressArg(TEST_ADDRESS),
    ];
    const decoded = decodeCallArgs(entry!.name, args);
    expect(decoded.args).toHaveLength(args.length);
    const extra = decoded.args[decoded.args.length - 1];
    expect(extra.label).toMatch(/raw|undecoded/i);
  });
});
