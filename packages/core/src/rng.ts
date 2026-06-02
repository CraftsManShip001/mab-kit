/**
 * A random number generator: a function returning a float in [0, 1).
 * `Math.random` satisfies this type. Inject a seeded RNG for deterministic tests.
 */
export type Rng = () => number;

/**
 * mulberry32 — a small, fast, seedable PRNG.
 * Deterministic given the same seed, which makes statistical tests reproducible.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal sample via Box–Muller, drawing uniforms from `rng`.
 */
export function sampleNormal(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
