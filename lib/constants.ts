import type { StatusMeta, TxStatus } from "./types";

export const STATUS_META: Record<TxStatus, StatusMeta> = {
  PENDING: {
    color: "var(--status-pending)",
    bg: "var(--status-pending-bg)",
    glow: "var(--status-pending-glow)",
    label: "PENDING",
  },
  PROCESSING: {
    color: "var(--status-processing)",
    bg: "var(--status-processing-bg)",
    glow: "var(--status-processing-glow)",
    label: "PROCESSING",
  },
  COMPLETED: {
    color: "var(--status-completed)",
    bg: "var(--status-completed-bg)",
    glow: "var(--status-completed-glow)",
    label: "COMPLETED",
  },
  FAILED: {
    color: "var(--status-failed)",
    bg: "var(--status-failed-bg)",
    glow: "var(--status-failed-glow)",
    label: "FAILED",
  },
};

export const AMBER = "var(--accent)";
export const NEUTRAL = "var(--fg)";
export const BG0 = "var(--bg-0)";
export const BG1 = "var(--bg-1)";
export const BG2 = "var(--bg-2)";
export const BG3 = "var(--bg-3)";
export const BORDER = "var(--border)";
export const DIM = "var(--dim)";

/**
 * The app's monospace stack.
 *
 * The variable is defined by `next/font` in `app/layout.tsx`, which self-hosts
 * the face and generates its own family name — so the literal string
 * "IBM Plex Mono" no longer resolves to anything and must not be used.
 *
 * Form controls do not inherit `font-family` from `body`, so buttons, inputs
 * and selects still need this applied explicitly rather than relying on the
 * cascade.
 */
export const MONO = "var(--font-ibm-plex-mono), monospace";

/**
 * Predefined Soroban RPC environments offered by the network switcher.
 *
 * `passphrase` is the network passphrase the endpoint is expected to report
 * via `getNetwork`. It is used to detect a passphrase mismatch when a user
 * validates a custom endpoint, so the two must stay in sync with the
 * predefined switcher options.
 */
export const SOROBAN_NETWORKS = [
  {
    id: "testnet",
    label: "Testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
  },
  {
    id: "futurenet",
    label: "Futurenet",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    passphrase: "Test SDF Future Network ; October 2022",
  },
] as const;

export type SorobanNetworkId = (typeof SOROBAN_NETWORKS)[number]["id"];

/**
 * Storage key for a user-supplied custom Soroban RPC endpoint. The value is
 * only written after a successful connectivity/compatibility validation.
 */
export const CUSTOM_RPC_STORAGE_KEY = "soroban.customRpcEndpoint";

/**
 * The RPC method used as a lightweight health-check before a custom endpoint
 * is persisted or activated. `getHealth` is the Soroban RPC equivalent of a
 * liveness probe and requires no signing.
 */
export const RPC_HEALTH_METHOD = "getHealth";

/**
 * The RPC method used to read the endpoint's network passphrase so a custom
 * endpoint can be rejected when it does not match the expected network.
 */
export const RPC_NETWORK_METHOD = "getNetwork";

/**
 * A single documented parameter of a contract entrypoint.
 *
 * `type` is the Soroban/ScVal type name used by the clear-signing decoder in
 * `lib/soroban/args.ts` to pick the right human-readable formatter. `struct`
 * names the struct shape for complex arguments so nested fields can be
 * decoded field-by-field instead of shown as an opaque blob.
 */
export type AbiParam = {
  name: string;
  type: "Address" | "String" | "bool" | "u32" | "i128" | "struct";
  struct?: string;
};

/**
 * Documented struct shapes referenced by `ABI_ENDPOINTS` parameters. Each
 * entry lists the fields (in order) of a Soroban struct argument so the
 * clear-signing decoder can label nested values.
 */
export const ABI_STRUCTS: Record<string, AbiParam[]> = {
  TxPayload: [
    { name: "tx_id", type: "String" },
    { name: "amount", type: "i128" },
    { name: "destination", type: "Address" },
  ],
  CallbackPayload: [
    { name: "tx_id", type: "String" },
    { name: "url", type: "String" },
    { name: "event", type: "String" },
  ],
};

export const ABI_ENDPOINTS = [
  {
    name: "initialize",
    sig: "initialize(admin: Address, relay_signer: Address)",
    access: "one-time",
    desc: "Bootstrap the contract. Fails if already initialized. One-time call only.",
    params: [
      { name: "admin", type: "Address" },
      { name: "relay_signer", type: "Address" },
    ] as AbiParam[],
  },
  {
    name: "register_transaction",
    sig: "register_transaction(payload: TxPayload) → tx_id: String",
    access: "relay_signer",
    desc: "Register a new transaction. Returns a UUID. Emits TransactionRegistered event.",
    params: [
      { name: "payload", type: "struct", struct: "TxPayload" },
    ] as AbiParam[],
  },
  {
    name: "start_processing",
    sig: "start_processing(tx_id: String)",
    access: "relay_signer",
    desc: "Advance transaction PENDING → PROCESSING. Emits StatusChanged.",
    params: [{ name: "tx_id", type: "String" }] as AbiParam[],
  },
  {
    name: "complete_transaction",
    sig: "complete_transaction(tx_id: String)",
    access: "relay_signer",
    desc: "Advance PROCESSING → COMPLETED. Emits StatusChanged + triggers callback.",
    params: [{ name: "tx_id", type: "String" }] as AbiParam[],
  },
  {
    name: "fail_transaction",
    sig: "fail_transaction(tx_id: String, reason: String)",
    access: "relay_signer",
    desc: "Mark transaction as FAILED with a reason string. Emits StatusChanged.",
    params: [
      { name: "tx_id", type: "String" },
      { name: "reason", type: "String" },
    ] as AbiParam[],
  },
  {
    name: "get_transaction",
    sig: "get_transaction(tx_id: String) → Transaction",
    access: "public",
    desc: "Read-only simulation. Returns full Transaction struct from ledger storage.",
    params: [{ name: "tx_id", type: "String" }] as AbiParam[],
  },
  {
    name: "is_duplicate",
    sig: "is_duplicate(tx_id: String) → bool",
    access: "public",
    desc: "Check whether a tx_id has already been registered. Safe read-only call.",
    params: [{ name: "tx_id", type: "String" }] as AbiParam[],
  },
  {
    name: "register_callback",
    sig: "register_callback(payload: CallbackPayload)",
    access: "relay_signer",
    desc: "Register a webhook URL for a transaction lifecycle event notification.",
    params: [
      { name: "payload", type: "struct", struct: "CallbackPayload" },
    ] as AbiParam[],
  },
  {
    name: "transfer_admin",
    sig: "transfer_admin(new_admin: Address)",
    access: "admin",
    desc: "Transfer admin rights. Caller must be the current admin address.",
    params: [{ name: "new_admin", type: "Address" }] as AbiParam[],
  },
  {
    name: "set_relay_signer",
    sig: "set_relay_signer(new_signer: Address)",
    access: "admin",
    desc: "Replace the relay signer address. Caller must be the current admin.",
    params: [{ name: "new_signer", type: "Address" }] as AbiParam[],
  },
  {
    name: "health",
    sig: "health() → String",
    access: "public",
    desc: "Returns contract health string. No signing required.",
    params: [] as AbiParam[],
  },
  {
    name: "version",
    sig: "version() → String",
    access: "public",
    desc: "Returns contract semver string e.g. '0.1.0'.",
    params: [] as AbiParam[],
  },
];
