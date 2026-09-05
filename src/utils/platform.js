// What kind of device is this, for the couple of places it genuinely matters.
//
// Feature detection is the right default and the app uses it everywhere else —
// optional chaining on navigator.vibrate, a guarded wakeLock, a prefixed
// AudioContext. But "how do I install this app" is not a feature you can
// detect: on Android and desktop the browser offers a prompt, and on iOS it is
// a hidden item in the Share menu that nobody finds without being told. That
// instruction is platform-specific by nature.
//
// Pure so it can be tested against real user-agent strings rather than guessed.

/** iPhone, iPad or iPod — including iPadOS 13+, which pretends to be a Mac. */
export function isIos({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13 onwards reports a desktop Safari UA; the touch points give it away.
  return userAgent.includes('Macintosh') && maxTouchPoints > 1;
}

/** Already installed to the home screen. */
export function isStandalone({ standalone, displayMode = false } = {}) {
  // iOS uses a non-standard navigator.standalone; everyone else has the media
  // query. Either being true means there is nothing to install.
  return standalone === true || displayMode === true;
}

/**
 * Whether to tell this person how to install.
 *
 * Only on iOS, only when not already installed. Android and desktop browsers
 * surface their own install affordance, so a hand-written hint there would be
 * duplicate noise.
 */
export function shouldOfferIosInstall(env = {}) {
  return isIos(env) && !isStandalone(env);
}

/** Read the current environment for the functions above. */
export function readEnv() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return {};
  return {
    userAgent: navigator.userAgent ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: navigator.standalone,
    displayMode: window.matchMedia?.('(display-mode: standalone)')?.matches ?? false,
  };
}
