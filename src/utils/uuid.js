/**
 * A v4 UUID, everywhere.
 *
 * `crypto.randomUUID()` only arrived in Safari 15.4 (March 2022). It is the id
 * generator for clubs, members, sessions and every game, so on an older iPhone
 * its absence would not degrade anything gracefully — creating a club would
 * throw and the app would be unusable.
 *
 * The fallback is built from `crypto.getRandomValues`, which Safari has had
 * since version 6. Same randomness source, same shape; only the convenience
 * wrapper is missing on those devices.
 */
export function uuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);

  // Version 4, variant 1 — the bits that make it a valid v4 rather than 16
  // random bytes wearing a hyphenated costume.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
