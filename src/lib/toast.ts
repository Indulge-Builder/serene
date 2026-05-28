/**
 * Toast singleton store — no React dependency.
 * Uses EventTarget for pub/sub so any context can fire toasts.
 * State is managed here; ToastProvider subscribes and renders.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "warning" | "danger" | "info" | "loading" | "lia";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message?: string;
  action?: ToastAction;
  duration?: number;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: ToastAction;
  duration: number;     // 0 = never auto-dismiss
  createdAt: number;
}

// ─── Dismiss timers per spec (Section 13.7) ──────────────────────────────────

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info:    5000,
  warning: 6000,
  danger:  0,      // never auto-dismisses
  loading: 0,      // lives until resolved
  lia:     7000,
};

// ─── Internal state ───────────────────────────────────────────────────────────

let _toasts: ToastItem[] = [];
let _queue:  ToastItem[] = [];
const MAX_VISIBLE = 3;

const _emitter = new EventTarget();

function _emit() {
  _emitter.dispatchEvent(new CustomEvent("change", { detail: [..._toasts] }));
}

// Internal queue event — signals queue length changed so callers can re-read if needed.
// Not part of the public API; only used inside _tryFlushQueue.
function _emitQueue() {
  _emitter.dispatchEvent(new CustomEvent("_queue_internal", { detail: _queue.length }));
}

function _nextId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function _tryFlushQueue() {
  while (_toasts.length < MAX_VISIBLE && _queue.length > 0) {
    const next = _queue.shift()!;
    _toasts = [next, ..._toasts];
    _emitQueue();
  }
  _emit();
}

function _add(item: ToastItem): string {
  if (_toasts.length < MAX_VISIBLE) {
    _toasts = [item, ..._toasts];
    _emit();
  } else {
    _queue = [..._queue, item];
    _emitQueue();
  }
  return item.id;
}

function _remove(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
  _queue  = _queue.filter((t) => t.id !== id);
  _tryFlushQueue();
}

function _update(id: string, patch: Partial<ToastItem>) {
  // Update in visible list
  const inVisible = _toasts.some((t) => t.id === id);
  if (inVisible) {
    _toasts = _toasts.map((t) => (t.id === id ? { ...t, ...patch } : t));
    _emit();
    return;
  }
  // Also update if the toast is still queued (e.g. resolve() called before it became visible)
  const inQueue = _queue.some((t) => t.id === id);
  if (inQueue) {
    _queue = _queue.map((t) => (t.id === id ? { ...t, ...patch } : t));
    // No need to emit — the queue isn't rendered. It will carry the patch when it promotes.
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function _create(type: ToastType, title: string, opts: ToastOptions = {}): string {
  const duration = opts.duration ?? DEFAULT_DURATIONS[type];
  return _add({
    id:        _nextId(),
    type,
    title,
    message:   opts.message,
    action:    opts.action,
    duration,
    createdAt: Date.now(),
  });
}

export const toast = {
  success(title: string, opts?: ToastOptions): string {
    return _create("success", title, opts);
  },

  danger(title: string, opts?: ToastOptions): string {
    return _create("danger", title, opts);
  },

  warning(title: string, opts?: ToastOptions): string {
    return _create("warning", title, opts);
  },

  info(title: string, opts?: ToastOptions): string {
    return _create("info", title, opts);
  },

  loading(title: string, opts?: ToastOptions): string {
    return _create("loading", title, opts);
  },

  lia(title: string, opts?: ToastOptions): string {
    return _create("lia", title, opts);
  },

  /**
   * Resolves a loading toast in place — no flicker.
   * The same id transitions type, icon, and text via crossfade.
   * Section 13.5: loading → success/danger transition.
   */
  resolve(
    id: string,
    type: Exclude<ToastType, "loading">,
    title: string,
    opts?: ToastOptions,
  ): void {
    const duration = opts?.duration ?? DEFAULT_DURATIONS[type];
    _update(id, {
      type,
      title,
      message:   opts?.message,
      action:    opts?.action,
      duration,
      createdAt: Date.now(),   // reset timer for the resolved state
    });
  },

  dismiss(id: string): void {
    _remove(id);
  },

  dismissAll(): void {
    _toasts = [];
    _queue  = [];
    _emit();
    _emitQueue();
  },

  // ─── Subscription helpers for ToastProvider ────────────────────────────────

  subscribe(listener: (toasts: ToastItem[]) => void): () => void {
    const handler = (e: Event) => {
      listener((e as CustomEvent<ToastItem[]>).detail);
    };
    _emitter.addEventListener("change", handler);
    return () => _emitter.removeEventListener("change", handler);
  },

  /** Get the current visible toasts (for initial render in provider). */
  getToasts(): ToastItem[] {
    return [..._toasts];
  },

  /** Remove a dismissed toast and flush queue. Called by ToastProvider. */
  _remove,
};
