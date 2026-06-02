/**
 * Utilities for turning raw Thompson weights into safe, deployable rollout
 * percentages. These are pure array transforms — easy to unit test.
 */

/**
 * Limit how far weights move from their previous values in a single update
 * (damping), then renormalize to sum to 1.
 *
 * This blunts the "users flip variants when rollout % changes" effect by
 * preventing large jumps; the bandit still converges, just more gently.
 *
 * @param prev   previous weights (aligned to `target`); pass [] on first run
 * @param target newly computed weights (should sum to ~1)
 * @param maxStep max absolute change per arm per update, e.g. 0.1
 */
export function applyDamping(prev: number[], target: number[], maxStep: number): number[] {
  if (prev.length !== target.length || maxStep <= 0) return normalize(target);
  const moved = target.map((t, i) => {
    const p = prev[i] ?? t;
    const delta = t - p;
    const clamped = Math.max(-maxStep, Math.min(maxStep, delta));
    return p + clamped;
  });
  return normalize(moved);
}

/**
 * Enforce a minimum weight per arm so no variant is ever fully starved
 * (keeps a little exploration so a temporarily-unlucky arm can recover).
 * Renormalizes after flooring.
 */
export function applyFloor(weights: number[], minWeight: number): number[] {
  if (minWeight <= 0 || weights.length === 0) return normalize(weights);
  const n = weights.length;
  if (minWeight * n >= 1) {
    // Floor impossible to satisfy without exceeding 1 — fall back to uniform.
    return weights.map(() => 1 / n);
  }
  // Reserve minWeight for every arm, then split the remaining mass
  // proportionally to the original weights. Guarantees each arm >= minWeight
  // AND the result sums to exactly 1 (no post-normalization that would
  // re-violate the floor).
  const reserved = minWeight * n;
  const remaining = 1 - reserved;
  const norm = normalize(weights);
  return norm.map((w) => minWeight + remaining * w);
}

/**
 * Convert fractional weights into integer percentages that sum exactly to
 * `total` (default 100), using the largest-remainder method. PostHog
 * multivariate variants require integer rollout percentages summing to 100.
 */
export function toIntegerPercentages(weights: number[], total = 100): number[] {
  if (weights.length === 0) return [];
  const norm = normalize(weights);
  const raw = norm.map((w) => w * total);
  const floors = raw.map((r) => Math.floor(r));
  const used = floors.reduce((a, b) => a + b, 0);
  let remainder = total - used;

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    result[order[k % order.length]!.i]!++;
    remainder--;
    k++;
  }
  return result;
}

/** Normalize a non-negative weight vector to sum to 1. Falls back to uniform. */
export function normalize(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const clamped = weights.map((w) => (w > 0 ? w : 0));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 1 / weights.length);
  return clamped.map((w) => w / sum);
}
