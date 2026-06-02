# @mab-kit/core

Framework-agnostic Multi-Armed Bandit core — **Beta-Bernoulli Thompson
Sampling** with zero dependencies. Pure, deterministic (inject a seeded RNG),
and easy to test.

```bash
pnpm add @mab-kit/core
```

## API

```ts
import {
  statsFromCounts,
  probabilityOfBest,
  applyFloor,
  applyDamping,
  toIntegerPercentages,
  mulberry32,
} from "@mab-kit/core";

// 1. Observed counts -> Beta posteriors
const arms = [
  statsFromCounts({ id: "control", trials: 1000, conversions: 100 }),
  statsFromCounts({ id: "test", trials: 1000, conversions: 140 }),
];

// 2. Population-level Thompson weights (probability each arm is best)
const weights = probabilityOfBest(arms, { iterations: 10_000 });

// 3. Shape into safe, deployable integer percentages
const safe = applyDamping(prevWeights, applyFloor(weights, 0.02), 0.1);
const pct = toIntegerPercentages(safe, 100); // sums to exactly 100
```

### Exports

- `sampleGamma`, `sampleBeta` — distribution samplers (Marsaglia–Tsang).
- `statsFromCounts(counts, prior?)` — `{trials, conversions}` → `Beta(α, β)`.
- `probabilityOfBest(arms, opts?)` — Monte Carlo Thompson weights (sum to 1).
- `selectArm(arms, rng?)` — single-draw argmax (per-request allocation).
- `applyFloor`, `applyDamping`, `normalize`, `toIntegerPercentages` — weight shaping.
- `mulberry32(seed)` — seedable RNG for reproducible runs/tests.

## License

MIT
