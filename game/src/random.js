// Seeded pseudo-random numbers: the game replays identically from the same seed.
// same game, which is what makes the ?shot= scenes and their screenshot frames repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (0x6d2b79f5 + a) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
// final pass
}
// bp ok
