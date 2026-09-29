import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsv, toJson } from "./formatters";
import type { Transaction } from "@/lib/types";

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    asset: "USDC",
    amount: 10.5,
    status: "COMPLETED",
    timestamp: 1700000000000,
    from: "GADDR1XXX",
    to: "GADDR2XXX",
    memo: "ref-001",
    callback_url: "https://api.example.com/cb",
    retries: 0,
    created_at: 1699999990000,
    ...overrides,
  };
}

describe("escapeCsvField", () => {
  it("returns plain value unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
  });

  it("wraps in quotes when value contains a comma", () => {
    expect(escapeCsvField("hello,world")).toBe('"hello,world"');
  });

  it("doubles internal quotes", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in quotes when value contains a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in quotes when value contains a carriage return", () => {
    expect(escapeCsvField("a\rb")).toBe('"a\rb"');
  });

  it("handles empty string", () => {
    expect(escapeCsvField("")).toBe("");
  });

  it("handles a value that is only quotes", () => {
    expect(escapeCsvField('""')).toBe('"""""');
  });
});

describe("toCsv", () => {
  it("produces a header row", () => {
    const csv = toCsv([]);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toContain("id");
    expect(firstLine).toContain("asset");
    expect(firstLine).toContain("amount");
    expect(firstLine).toContain("status");
  });

  it("produces one data row per transaction", () => {
    const csv = toCsv([makeTx(), makeTx({ id: "other-id" })]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("includes tx field values", () => {
    const csv = toCsv([makeTx()]);
    expect(csv).toContain("550e8400");
    expect(csv).toContain("USDC");
    expect(csv).toContain("COMPLETED");
  });

  it("escapes memo fields with commas", () => {
    const csv = toCsv([makeTx({ memo: "a,b,c" })]);
    expect(csv).toContain('"a,b,c"');
  });

  it("escapes callback_url with special chars", () => {
    const csv = toCsv([makeTx({ callback_url: 'https://x.com/cb?a=1&b="2"' })]);
    expect(csv).toContain('""2""');
  });

  it("handles empty array (header only)", () => {
    const csv = toCsv([]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it("handles large sets without error (chunked)", () => {
    const big = Array.from({ length: 1500 }, (_, i) => makeTx({ id: `id-${i}` }));
    const csv = toCsv(big);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1501); // header + 1500 rows
  });
});

describe("toJson", () => {
  it("returns valid JSON", () => {
    const json = toJson([makeTx()]);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("includes all transaction fields", () => {
    const parsed = JSON.parse(toJson([makeTx()]));
    expect(parsed[0].id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(parsed[0].asset).toBe("USDC");
    expect(parsed[0].status).toBe("COMPLETED");
  });

  it("annotates timestamps with ISO strings", () => {
    const parsed = JSON.parse(toJson([makeTx()]));
    expect(parsed[0].created_at_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed[0].timestamp_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles empty array", () => {
    const parsed = JSON.parse(toJson([]));
    expect(parsed).toEqual([]);
  });

  it("preserves numeric types", () => {
    const parsed = JSON.parse(toJson([makeTx({ amount: 99.99, retries: 3 })]));
    expect(typeof parsed[0].amount).toBe("number");
    expect(typeof parsed[0].retries).toBe("number");
  });
});
