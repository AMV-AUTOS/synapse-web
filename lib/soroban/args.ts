import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { ABI_ENDPOINTS } from "../constants";

export function addressArg(value: string) {
  return new Address(value).toScVal();
}

export function stringArg(value: string) {
  return nativeToScVal(value, { type: "string" });
}

/** Encodes a plain object as an ScVal map — used for #[contracttype] struct arguments. */
export function structArg(value: Record<string, unknown>) {
  return nativeToScVal(value);
}

export type DecodedArg = {
  name: string;
  type: string;
  value: string;
};

export type DecodedCall = {
  /** True when the entrypoint is documented in ABI_ENDPOINTS and args were labeled. */
  decoded: boolean;
  /** Human-readable label for the entrypoint, when known. */
  label?: string;
  args: DecodedArg[];
};

/** Renders a decoded native value as a human-readable string. */
function formatNative(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Address) return value.toString();
  if (Array.isArray(value)) return value.map(formatNative).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatNative(v)}`)
      .join(", ");
  }
  return String(value);
}

/** Best-effort decode of a single ScVal into a display string. */
function decodeScVal(arg: xdr.ScVal): string {
  try {
    return formatNative(scValToNative(arg));
  } catch {
    return arg.toXDR("base64");
  }
}

/**
 * Pairs ABI_ENDPOINTS parameter metadata with the actual ScVal arguments passed
 * into a contract call, producing labeled key/value pairs for clear-signing.
 * Falls back to a clearly-marked raw view for undocumented entrypoints.
 */
export function decodeCallArgs(
  entrypoint: string,
  args: xdr.ScVal[] = [],
): DecodedCall {
  const meta = ABI_ENDPOINTS[entrypoint];

  if (!meta) {
    return {
      decoded: false,
      args: args.map((arg, i) => ({
        name: `arg${i}`,
        type: "raw",
        value: decodeScVal(arg),
      })),
    };
  }

  const params = meta.params ?? [];
  return {
    decoded: true,
    label: meta.label ?? entrypoint,
    args: args.map((arg, i) => {
      const param = params[i];
      return {
        name: param?.name ?? `arg${i}`,
        type: param?.type ?? "unknown",
        value: decodeScVal(arg),
      };
    }),
  };
}
