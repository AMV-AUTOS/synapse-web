"use client";

/**
 * Unified toast/notification queue manager.
 *
 * A small pub/sub queue that centralizes stacking, deduplication, priority
 * and auto-dismiss timing. UI layers (e.g. components/ui/Toast.tsx) subscribe
 * to render the current visible stack; feature code only calls the imperative
 * `toast.success()/error()/info()` API.
 */

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  /** Higher value = higher priority. Errors outrank info/success. */
  priority: number;
  /** Auto-dismiss delay in ms. */
  duration: number;
  createdAt: number;
}

export interface ToastOptions {
  /** Override the default auto-dismiss delay (ms). */
  duration?: number;
  /** Override the default priority for the toast type. */
  priority?: number;
  /**
   * Deduplication window (ms). Identical messages fired within this window
   * are collapsed into the existing toast instead of stacking. Defaults to
   * DEDUPE_WINDOW_MS.
   */
  dedupeWindow?: number;
}

/** Default auto-dismiss timings per type (ms). */
export const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
};

/** Default priorities per type. Errors must never be dropped by overflow. */
export const DEFAULT_PRIORITIES: Record<ToastType, number> = {
  info: 0,
  success: 1,
  error: 2,
};

/** Window within which identical toasts are deduplicated (ms). */
export const DEDUPE_WINDOW_MS = 1500;

/** Default maximum number of simultaneously visible toasts. */
export const DEFAULT_MAX_VISIBLE = 3;

let seq = 0;
function nextId(): string {
  seq += 1;
  return `toast-${Date.now().toString(36)}-${seq}`;
}

function keyOf(type: ToastType, message: string): string {
  return `${type}::${message}`;
}

export class ToastQueue {
  private items: ToastItem[] = [];
  private listeners = new Set<(items: ToastItem[]) => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastSeen = new Map<string, number>();
  private maxVisible: number;

  constructor(maxVisible: number = DEFAULT_MAX_VISIBLE) {
    this.maxVisible = Math.max(1, maxVisible);
  }

  /** Update the maximum number of simultaneously visible toasts. */
  setMaxVisible(maxVisible: number): void {
    this.maxVisible = Math.max(1, maxVisible);
    this.enforceOverflow();
    this.emit();
  }

  getMaxVisible(): number {
    return this.maxVisible;
  }

  /** Subscribe to stack changes. Returns an unsubscribe function. */
  subscribe(listener: (items: ToastItem[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getVisible());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Current visible stack (sorted by priority, then recency). */
  getVisible(): ToastItem[] {
    return [...this.items].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.createdAt - a.createdAt;
    });
  }

  success(message: string, options?: ToastOptions): string {
    return this.push("success", message, options);
  }

  error(message: string, options?: ToastOptions): string {
    return this.push("error", message, options);
  }

  info(message: string, options?: ToastOptions): string {
    return this.push("info", message, options);
  }

  /**
   * Enqueue a toast. Identical rapid-fire toasts are deduplicated; the stack
   * is capped at maxVisible with overflow handled by priority so that
   * high-priority (error) toasts are never dropped for lower-priority ones.
   */
  push(type: ToastType, message: string, options: ToastOptions = {}): string {
    const now = Date.now();
    const dedupeWindow = options.dedupeWindow ?? DEDUPE_WINDOW_MS;
    const key = keyOf(type, message);

    // Deduplicate identical rapid-fire toasts.
    const last = this.lastSeen.get(key);
    if (last !== undefined && now - last < dedupeWindow) {
      const existing = this.items.find((i) => keyOf(i.type, i.message) === key);
      if (existing) {
        this.lastSeen.set(key, now);
        this.restartTimer(existing);
        this.emit();
        return existing.id;
      }
    }
    this.lastSeen.set(key, now);

    const item: ToastItem = {
      id: nextId(),
      message,
      type,
      priority: options.priority ?? DEFAULT_PRIORITIES[type],
      duration: options.duration ?? DEFAULT_DURATIONS[type],
      createdAt: now,
    };

    this.items.push(item);
    this.enforceOverflow();
    this.scheduleDismiss(item);
    this.emit();
    return item.id;
  }

  /** Manually dismiss a toast by id. */
  dismiss(id: string): void {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    this.items.splice(idx, 1);
    this.clearTimer(id);
    this.emit();
  }

  /** Remove all toasts. */
  clear(): void {
    for (const item of this.items) this.clearTimer(item.id);
    this.items = [];
    this.emit();
  }

  /**
   * Trim the stack to maxVisible. When overflowing, drop the lowest-priority
   * (and oldest) toasts first so errors survive over info/success toasts.
   */
  private enforceOverflow(): void {
    if (this.items.length <= this.maxVisible) return;

    const overflow = this.items.length - this.maxVisible;
    const droppable = [...this.items].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

    const toDrop = new Set(droppable.slice(0, overflow).map((i) => i.id));
    this.items = this.items.filter((i) => !toDrop.has(i.id));
    for (const id of toDrop) this.clearTimer(id);
  }

  private scheduleDismiss(item: ToastItem): void {
    if (item.duration <= 0) return;
    this.clearTimer(item.id);
    const timer = setTimeout(() => this.dismiss(item.id), item.duration);
    this.timers.set(item.id, timer);
  }

  private restartTimer(item: ToastItem): void {
    this.scheduleDismiss(item);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private emit(): void {
    const visible = this.getVisible();
    for (const listener of this.listeners) listener(visible);
  }
}

/** Shared singleton queue used across the app. */
export const toastQueue = new ToastQueue();

/** Imperative API: toast.success()/error()/info(). */
export const toast = {
  success: (message: string, options?: ToastOptions) => toastQueue.success(message, options),
  error: (message: string, options?: ToastOptions) => toastQueue.error(message, options),
  info: (message: string, options?: ToastOptions) => toastQueue.info(message, options),
  dismiss: (id: string) => toastQueue.dismiss(id),
  clear: () => toastQueue.clear(),
};
