// Theme application. Dark is the default (see styles/tokens.css for why), but
// light is a first-class design because phones read better in direct sunlight.

export const THEMES = ['system', 'dark', 'light'];

export function resolveTheme(preference) {
  if (preference === 'dark' || preference === 'light') return preference;
  const prefersLight =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

export function applyTheme(preference) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  // Keep the Android status bar / iOS notch in step with the app background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f4f6f8' : '#0b1220');
  return resolved;
}

/**
 * Re-apply on OS change while the preference is 'system'.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(getPreference, onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if (getPreference() === 'system') {
      const resolved = applyTheme('system');
      onChange?.(resolved);
    }
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
