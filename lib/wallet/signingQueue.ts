import { StellarWalletsKit } from "./kit";

export type SigningRequestStatus =
  | "pending"
  | "signing"
  | "signed"
  | "cancelled"
  | "stale"
  | "failed";

export interface SigningRequest<T = string> {
  id: string;
  label: string;
  /** Builds the XDR to sign. May throw if the underlying tx is stale/invalid. */
  build: () => Promise<string> | string;
  /** Optional staleness check run right before signing. */
  isStale?: () => boolean;
  status: SigningRequestStatus;
  result?: T;
  error?: string;
}

export interface SigningQueueState {
  items: SigningRequest[];
  activeId: string | null;
  total: number;
  completed: number;
  cancelled: boolean;
}

type Listener = (state: SigningQueueState) => void;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `sign-${Date.now()}-${counter}`;
}

/**
 * App-wide FIFO queue that serializes every wallet-signature request so that
 * concurrent extension popups never collide. Strict FIFO for this issue.
 */
class SigningQueue {
  private items: SigningRequest[] = [];
  private activeId: string | null = null;
  private running = false;
  private cancelled = false;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SigningQueueState {
    const completed = this.items.filter(
      (i) => i.status === "signed" || i.status === "stale" || i.status === "failed" || i.status === "cancelled",
    ).length;
    return {
      items: this.items.map((i) => ({ ...i })),
      activeId: this.activeId,
      total: this.items.length,
      completed,
      cancelled: this.cancelled,
    };
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  /**
   * Enqueue a signing request. Returns a promise that resolves with the signed
   * XDR, or rejects if the item was cancelled, stale, or failed.
   */
  enqueue<T = string>(request: Omit<SigningRequest<T>, "id" | "status">): Promise<T> {
    const item: SigningRequest = {
      ...request,
      id: nextId(),
      status: "pending",
    };
    this.items.push(item);
    this.emit();

    return new Promise<T>((resolve, reject) => {
      (item as SigningRequest & { _resolve?: (v: T) => void; _reject?: (e: Error) => void })._resolve = resolve;
      (item as SigningRequest & { _resolve?: (v: T) => void; _reject?: (e: Error) => void })._reject = reject;
      void this.drain();
    });
  }

  /** Cancel all remaining queued (not yet signing) items. */
  cancelRemaining(): void {
    this.cancelled = true;
    for (const item of this.items) {
      if (item.status === "pending") {
        item.status = "cancelled";
        item.error = "Cancelled by user";
        this.settle(item, new Error("Signing request cancelled"));
      }
    }
    this.emit();
  }

  private settle(item: SigningRequest, error?: Error): void {
    const withHandlers = item as SigningRequest & {
      _resolve?: (v: unknown) => void;
      _reject?: (e: Error) => void;
    };
    if (error) {
      withHandlers._reject?.(error);
    } else {
      withHandlers._resolve?.(item.result);
    }
    withHandlers._resolve = undefined;
    withHandlers._reject = undefined;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const next = this.items.find((i) => i.status === "pending");
        if (!next) break;

        this.activeId = next.id;
        next.status = "signing";
        this.emit();

        try {
          if (next.isStale?.()) {
            next.status = "stale";
            next.error = "Transaction is no longer valid and was skipped";
            this.settle(next, new Error(next.error));
            this.emit();
            continue;
          }

          const xdr = await next.build();
          const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: undefined,
          });
          next.status = "signed";
          next.result = signedTxXdr as unknown as string;
          this.settle(next);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const stale = /stale|expired|not found|invalid|tx_bad|timebound/i.test(message);
          next.status = stale ? "stale" : "failed";
          next.error = stale
            ? "Transaction is no longer valid and was skipped"
            : message;
          this.settle(next, new Error(next.error));
        }
        this.emit();
      }
    } finally {
      this.activeId = null;
      this.running = false;
      this.emit();
    }
  }
}

export const signingQueue = new SigningQueue();
