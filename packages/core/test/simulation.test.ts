import { describe, it, expect } from "vitest";
import {
  mulberry32,
  probabilityOfBest,
  statsFromCounts,
  type ArmCounts,
  type Rng,
} from "../src/index.js";

/**
 * End-to-end bandit simulation.
 *
 * Two variants with true conversion rates 0.10 (A) and 0.16 (B). We compare:
 *  - Fixed 50:50 A/B (the status quo this library replaces)
 *  - Population-level Thompson Sampling, re-weighted in periodic batches
 *
 * We assert that Thompson:
 *  1. shifts the majority of traffic to the better arm (B), and
 *  2. accrues strictly less cumulative regret than fixed 50:50.
 *
 * Regret = (best rate - chosen arm's rate), summed over all users. It measures
 * the conversions lost by not always showing the best variant.
 */

const TRUE_RATES: Record<string, number> = { A: 0.1, B: 0.16 };
const BEST_RATE = Math.max(...Object.values(TRUE_RATES));
const IDS = Object.keys(TRUE_RATES);

function convert(id: string, rng: Rng): boolean {
  return rng() < TRUE_RATES[id]!;
}

function pickByWeights(ids: string[], weights: number[], rng: Rng): string {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < ids.length; i++) {
    acc += weights[i]!;
    if (r < acc) return ids[i]!;
  }
  return ids[ids.length - 1]!;
}

describe("MAB simulation vs fixed 50:50", () => {
  it("converges to the better arm and beats fixed split on regret", () => {
    const rng = mulberry32(2024);
    const USERS = 20_000;
    const BATCH = 500; // re-weight every 500 users

    const counts: Record<string, ArmCounts> = {
      A: { id: "A", trials: 0, conversions: 0 },
      B: { id: "B", trials: 0, conversions: 0 },
    };

    let weights = [0.5, 0.5];
    let banditRegret = 0;
    let fixedRegret = 0;

    for (let u = 0; u < USERS; u++) {
      // ---- Bandit arm ----
      const chosen = pickByWeights(IDS, weights, rng);
      const converted = convert(chosen, rng);
      const c = counts[chosen]!;
      c.trials++;
      if (converted) c.conversions++;
      banditRegret += BEST_RATE - TRUE_RATES[chosen]!;

      // ---- Fixed 50:50 arm (independent traffic) ----
      const fixedChosen = rng() < 0.5 ? "A" : "B";
      fixedRegret += BEST_RATE - TRUE_RATES[fixedChosen]!;

      // ---- Periodic re-weight (the recompute batch) ----
      if ((u + 1) % BATCH === 0) {
        const arms = IDS.map((id) => statsFromCounts(counts[id]!));
        weights = probabilityOfBest(arms, { iterations: 2000, rng });
      }
    }

    // 1) Majority of traffic ended up on the better arm B.
    const finalBWeight = weights[IDS.indexOf("B")]!;
    expect(finalBWeight).toBeGreaterThan(0.7);
    expect(counts.B!.trials).toBeGreaterThan(counts.A!.trials);

    // 2) Thompson accrued less cumulative regret than fixed 50:50.
    expect(banditRegret).toBeLessThan(fixedRegret);

    // Sanity: fixed split regret ≈ USERS * (gap / 2)
    const gap = TRUE_RATES.B! - TRUE_RATES.A!;
    expect(fixedRegret).toBeCloseTo(USERS * (gap / 2), -1);
  });
});
