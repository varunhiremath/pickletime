import { create } from 'zustand';

// Themed dialogs and toasts. The app never calls window.confirm/prompt/alert —
// those can't be styled, and on Android they read as a browser warning rather
// than part of the app. UiHost renders whatever lands in here.

let idSeq = 0;

const useUIStore = create((set, get) => ({
  toasts: [],
  confirmState: null, // { title, message, confirmLabel, cancelLabel, danger, resolve }
  promptState: null,  // { title, message, placeholder, defaultValue, resolve }

  showToast(message, opts = {}) {
    const id = ++idSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type: opts.type ?? 'info' }] }));
    setTimeout(() => get().dismissToast(id), opts.duration ?? 3200);
    return id;
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  /** Returns Promise<boolean>. */
  confirm(options) {
    return new Promise((resolve) => set({ confirmState: { ...options, resolve } }));
  },
  resolveConfirm(result) {
    const st = get().confirmState;
    set({ confirmState: null });
    st?.resolve(result);
  },

  /** Returns Promise<string|null>; null means cancelled. */
  prompt(options) {
    return new Promise((resolve) => set({ promptState: { ...options, resolve } }));
  },
  resolvePrompt(value) {
    const st = get().promptState;
    set({ promptState: null });
    st?.resolve(value);
  },
}));

export default useUIStore;

// Convenience helpers for non-component code (sync layer, actions).
export const toast = (message, opts) => useUIStore.getState().showToast(message, opts);
export const confirmDialog = (options) => useUIStore.getState().confirm(options);
export const promptDialog = (options) => useUIStore.getState().prompt(options);
