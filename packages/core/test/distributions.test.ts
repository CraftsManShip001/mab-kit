import { describe, it, expect } from "vitest";
import { mulberry32, sampleBeta, sampleGamma } from "../src/index.js";

function meanVar(samples: number[]): { mean: number; variance: number } {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, variance };
}

describe("sampleGamma", () => {
  it("matches the theoretical mean (= shape) for scale 1", () => {
    const rng = mulberry32(42);
    const shape = 4;
    const samples = Array.from({ length: 50_000 }, () => sampleGamma(shape, rng));
    const { mean, variance } = meanVar(samples);
    // E[Gamma(k,1)] = k, Var = k
    expect(mean).toBeCloseTo(shape, 1);
    expect(variance).toBeCloseTo(shape, 0);
  });

  it("handles shape < 1 via the boosting identity", () => {
    const rng = mulberry32(7);
    const shape = 0.5;
    const samples = Array.from({ length: 50_000 }, () => sampleGamma(shape, rng));
    const { mean } = meanVar(samples);
    expect(mean).toBeCloseTo(shape, 1);
    expect(samples.every((s) => s > 0)).toBe(true);
  });

  it("throws on non-positive shape", () => {
    const rng = mulberry32(1);
    expect(() => sampleGamma(0, rng)).toThrow();
    expect(() => sampleGamma(-2, rng)).toThrow();
  });
});

describe("sampleBeta", () => {
  it("converges to the theoretical mean and variance", () => {
    const rng = mulberry32(123);
    const alpha = 8;
    const beta = 4;
    const samples = Array.from({ length: 80_000 }, () => sampleBeta(alpha, beta, rng));
    const { mean, variance } = meanVar(samples);

    const expectedMean = alpha / (alpha + beta);
    const expectedVar =
      (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));

    expect(mean).toBeCloseTo(expectedMean, 2);
    expect(variance).toBeCloseTo(expectedVar, 3);
    expect(samples.every((s) => s >= 0 && s <= 1)).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    const seqA = Array.from({ length: 100 }, () => sampleBeta(2, 5, a));
    const seqB = Array.from({ length: 100 }, () => sampleBeta(2, 5, b));
    expect(seqA).toEqual(seqB);
  });
});
