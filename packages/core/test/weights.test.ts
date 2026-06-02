import { describe, it, expect } from "vitest";
import {
  applyDamping,
  applyFloor,
  normalize,
  toIntegerPercentages,
} from "../src/index.js";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("normalize", () => {
  it("scales to sum 1", () => {
    expect(sum(normalize([1, 1, 2]))).toBeCloseTo(1);
  });
  it("falls back to uniform when all zero", () => {
    expect(normalize([0, 0])).toEqual([0.5, 0.5]);
  });
});

describe("applyDamping", () => {
  it("limits per-arm movement to maxStep", () => {
    const prev = [0.5, 0.5];
    const target = [0.9, 0.1];
    const out = applyDamping(prev, target, 0.1);
    // arm 0 may move at most +0.1 before renormalization
    expect(out[0]!).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(sum(out)).toBeCloseTo(1);
  });
  it("passes target through when no prev provided", () => {
    expect(sum(applyDamping([], [0.7, 0.3], 0.1))).toBeCloseTo(1);
  });
});

describe("applyFloor", () => {
  it("guarantees a minimum weight per arm", () => {
    const out = applyFloor([0.98, 0.02], 0.1);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0.1 - 1e-9);
    expect(sum(out)).toBeCloseTo(1);
  });
});

describe("toIntegerPercentages", () => {
  it("returns integers summing exactly to 100", () => {
    const pct = toIntegerPercentages([0.333, 0.333, 0.334]);
    expect(pct.every((p) => Number.isInteger(p))).toBe(true);
    expect(sum(pct)).toBe(100);
  });
  it("handles awkward thirds without losing a unit", () => {
    const pct = toIntegerPercentages([1 / 3, 1 / 3, 1 / 3]);
    expect(sum(pct)).toBe(100);
  });
});
