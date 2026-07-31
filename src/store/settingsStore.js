import { create } from 'zustand';
import { applyTheme } from '../utils/theme.js';

const KEY = 'pickletime_prefs';

const DEFAULTS = {
  theme: 'system',   // 'system' | 'dark' | 'light'
  effects: true,     // animations and particle bursts
  sound: true,       // chimes on a finished game
  haptics: true,     // vibration on score entry
  onboarded: false,
  // Setup defaults, remembered between sessions so the admin isn't retyping.
  lastFormat: 'doubles_americano',
  lastNumGames: 8,
  lastCourts: 1,
  lastPointsTo: 11,
};

const PERSISTED = Object.keys(DEFAULTS);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function persist(state) {
  try {
    const slice = Object.fromEntries(PERSISTED.map((k) => [k, state[k]]));
    localStorage.setItem(KEY, JSON.stringify(slice));
  } catch {
    // Private-mode or quota failures are not worth breaking the app over.
  }
}

const useSettingsStore = create((set, get) => ({
  ...DEFAULTS,
  ...load(),

  set(patch) {
    set(patch);
    persist(get());
  },

  setTheme(theme) {
    applyTheme(theme);
    get().set({ theme });
  },

  toggle(key) {
    get().set({ [key]: !get()[key] });
  },

  reset() {
    set(DEFAULTS);
    persist(get());
    applyTheme(DEFAULTS.theme);
  },
}));

export default useSettingsStore;
