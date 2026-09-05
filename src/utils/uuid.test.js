import { describe, it, expect, afterEach } from 'vitest';
import { uuid } from './uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const original = globalThis.crypto.randomUUID;
afterEach(() => {
  globalThis.crypto.randomUUID = original;
});

/** Pretend to be an iPhone on iOS 15.3, where randomUUID does not exist. */
function withoutRandomUUID(fn) {
  globalThis.crypto.randomUUID = undefined;
  try {
    return fn();
  } finally {
    globalThis.crypto.randomUUID = original;
  }
}

describe('uuid', () => {
  it('produces a v4 uuid', () => {
    expect(uuid()).toMatch(V4);
  });

  it('produces a v4 uuid without crypto.randomUUID', () => {
    // Safari only shipped randomUUID in 15.4, and this is the id generator for
    // every club, member, session and game — an older iPhone must not be stuck
    // unable to create anything.
    withoutRandomUUID(() => {
      expect(uuid()).toMatch(V4);
    });
  });

  it('sets the version and variant bits on the fallback path', () => {
    withoutRandomUUID(() => {
      const id = uuid();
      expect(id[14]).toBe('4');                    // version 4
      expect('89ab').toContain(id[19]);            // variant 1
    });
  });

  it('does not repeat itself', () => {
    const many = new Set(Array.from({ length: 500 }, () => uuid()));
    expect(many.size).toBe(500);

    withoutRandomUUID(() => {
      const fallback = new Set(Array.from({ length: 500 }, () => uuid()));
      expect(fallback.size).toBe(500);
    });
  });

  it('uses the native implementation when it is there', () => {
    let called = 0;
    globalThis.crypto.randomUUID = () => {
      called++;
      return '11111111-1111-4111-8111-111111111111';
    };
    expect(uuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(called).toBe(1);
  });
});
