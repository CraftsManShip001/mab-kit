import { sampleBeta } from "./distributions.js";
import { type Rng } from "./rng.js";

/** Raw observed counts for one variant (arm). */
export interface ArmCounts {
  /** Variant key, e.g. the PostHog feature-flag variant id. */
  id: string;
  /** Number of times this variant was shown (exposures). */
  trials: number;
  /** Number of conversions among those exposures (0 <= conversions <= trials). */
  conversions: number;
}

/** Beta posterior parameters for one variant. */
export interface ArmStats {
  id: string;
  /** alpha = priorAlpha + conversions */
  alpha: number;
  /** beta = priorBeta + (trials - conversions) */
  beta: number;
}

export interface PriorOptions {
  /** Prior successes. Default 1 (uniform Beta(1,1) prior → starts at 50:50). */
  priorAlpha?: number;
  /** Prior failures. Default 1. */
  priorBeta?: number;
}

/**
 * Build a Beta posterior from observed counts.
 * Beta(1 + conversions, 1 + failures) by default.
 */
export function statsFromCounts(counts: ArmCounts, opts: PriorOptions = {}): ArmStats {
  const priorAlpha = opts.priorAlpha ?? 1;
  const priorBeta = opts.priorBeta ?? 1;
  const conversions = Math.max(0, counts.conversions);
  const failures = Math.max(0, counts.trials - counts.conversions);
  return {
    id: counts.id,
    alpha: priorAlpha + conversions,
    beta: priorBeta + failures,
  };
}

export interface ProbabilityOfBestOptions {
  /** Monte Carlo iterations. Higher = smoother estimates. Default 10000. */
  iterations?: number;
  /** Inject a seeded RNG for deterministic results. Default Math.random. */
  rng?: Rng;
}

/**
 * Population-level Thompson Sampling.
 *
 * Estimates, for each arm, the probability that it has the highest true
 * conversion rate, by repeatedly drawing one sample per arm from its Beta
 * posterior and counting argmax wins.
 *
 * The returned probabilities sum to 1 and are used directly as traffic weights:
 * when data is sparse, posteriors are wide so weights stay near uniform (≈50:50);
 * as evidence accrues, the better arm's weight rises automatically.
 *
 * Returned array is aligned to the input `arms` order.
 */
export function probabilityOfBest(
  arms: ArmStats[],
  opts: ProbabilityOfBestOptions = {},
): number[] {
  const iterations = opts.iterations ?? 10_000;
  const rng = opts.rng ?? Math.random;

  if (arms.length === 0) return [];
  if (arms.length === 1) return [1];

  const wins = new Array<number>(arms.length).fill(0);

  for (let i = 0; i < iterations; i++) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let j = 0; j < arms.length; j++) {
      const arm = arms[j]!;
      const sample = sampleBeta(arm.alpha, arm.beta, rng);
      if (sample > bestVal) {
        bestVal = sample;
        bestIdx = j;
      }
    }
    wins[bestIdx]!++;
  }

  return wins.map((w) => w / iterations);
}

/**
 * Single-draw Thompson Sampling: sample once per arm and return the argmax arm id.
 * Useful for per-request allocation in adapters that assign on the fly
 * (the PostHog adapter uses population weights instead).
 */
export function selectArm(arms: ArmStats[], rng: Rng = Math.random): string {
  if (arms.length === 0) throw new RangeError("selectArm: no arms provided");
  let bestId = arms[0]!.id;
  let bestVal = -Infinity;
  for (const arm of arms) {
    const sample = sampleBeta(arm.alpha, arm.beta, rng);
    if (sample > bestVal) {
      bestVal = sample;
      bestId = arm.id;
    }
  }
  return bestId;
}
