import { sampleNormal, type Rng } from "./rng.js";

/**
 * Sample from a Gamma(shape, scale=1) distribution using the
 * Marsaglia–Tsang method. For shape < 1 we use the boosting identity
 * G(a) = G(a+1) * U^(1/a).
 *
 * No external dependencies — pure rejection sampling on top of `rng`.
 */
export function sampleGamma(shape: number, rng: Rng): number {
  if (shape <= 0) {
    throw new RangeError(`sampleGamma: shape must be > 0, got ${shape}`);
  }
  if (shape < 1) {
    const u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // Rejection loop. Terminates with probability 1; iterations are tiny in expectation.
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng();
    const x2 = x * x;

    // Squeeze: cheap acceptance test that avoids the log most of the time.
    if (u < 1 - 0.0331 * x2 * x2) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Sample from a Beta(alpha, beta) distribution via two Gamma samples:
 * X ~ Gamma(alpha, 1), Y ~ Gamma(beta, 1)  =>  X / (X + Y) ~ Beta(alpha, beta).
 */
export function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  const sum = x + y;
  // Degenerate guard: if both gammas underflow to 0, fall back to the mean.
  if (sum === 0) return alpha / (alpha + beta);
  return x / sum;
}
