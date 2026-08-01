import useSettingsStore from '../store/settingsStore.js';

// Vibration patterns. Android honours arrays; iOS Safari ignores navigator
// .vibrate entirely, which is fine — it degrades to nothing.
const PATTERNS = {
  tap: 10,
  bump: 18,
  success: [22, 36, 44],
  win: [55, 45, 110],
  error: [12, 30, 12],
};

/** Returns fire(kind) — vibrates when haptics are enabled in settings. */
export function useHaptics() {
  const haptics = useSettingsStore((s) => s.haptics);
  return (kind = 'tap') => {
    if (!haptics) return;
    navigator.vibrate?.(PATTERNS[kind] ?? PATTERNS.tap);
  };
}

/** Non-hook variant for use inside actions and the sync layer. */
export function fireHaptic(kind = 'tap') {
  if (!useSettingsStore.getState().haptics) return;
  navigator.vibrate?.(PATTERNS[kind] ?? PATTERNS.tap);
}
