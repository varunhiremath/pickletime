// Seeded pseudo-random number generator.
//
// The original app used Math.random() for tie-breaks inside the doubles
// scheduler, which made schedules impossible to reproduce or test. Seeding it
// buys three things at once:
//   1. the same seed always produces the same schedule (testable),
//   2. a session's schedule can be regenerated from `rng_seed` alone,
//   3. "reshuffle" is just a new seed.

// mulberry32 — small, fast, good enough distribution for shuffling players.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turns an arbitrary string into a 32-bit seed (FNV-1a), so a session id or a
// human-typed word can seed a schedule.
export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// A fresh random seed, for "new session" and "reshuffle".
export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// Fisher-Yates, driven by the supplied rng. Returns a new array.
export function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
