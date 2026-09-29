import type { Transaction } from "@/lib/types";

const CSV_HEADERS = [
  "id",
  "asset",
  "amount",
  "status",
  "from",
  "to",
  "memo",
  "callback_url",
  "retries",
  "created_at",
  "timestamp",
];

/** Escapes a single CSV field per RFC 4180. */
export function escapeCsvField(value: string | number): string {
  const str = String(value);
  // Wrap in quotes if the field contains a comma, quote, newline, or carriage return
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function txToCsvRow(tx: Transaction): string {
  return CSV_HEADERS.map((key) => escapeCsvField(tx[key as keyof Transaction] as string | number)).join(",");
}

/**
 * Converts an array of transactions to a CSV string.
 * Uses chunked string building to avoid freezing the UI on large datasets.
 */
export function toCsv(txs: Transaction[]): string {
  const CHUNK = 500;
  const parts: string[] = [CSV_HEADERS.join(",")];

  for (let i = 0; i < txs.length; i += CHUNK) {
    const chunk = txs.slice(i, i + CHUNK);
    parts.push(chunk.map(txToCsvRow).join("\n"));
  }

  return parts.join("\n");
}

/**
 * Converts an array of transactions to a pretty-printed JSON string.
 * Timestamps are annotated with ISO strings for readability.
 */
export function toJson(txs: Transaction[]): string {
  const annotated = txs.map((tx) => ({
    ...tx,
    created_at_iso: new Date(tx.created_at).toISOString(),
    timestamp_iso: new Date(tx.timestamp).toISOString(),
  }));
  return JSON.stringify(annotated, null, 2);
}

/**
 * Triggers a browser download of the given content as a file.
 */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
