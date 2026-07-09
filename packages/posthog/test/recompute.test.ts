import { describe, it, expect } from "vitest";
import { mulberry32 } from "@mab-kit/core";
import { recompute } from "../src/index.js";

interface MockState {
  variants: { key: string; rollout_percentage: number }[];
  trials: Record<string, number>;
  conversions: Record<string, number>;
  patched?: { id: number; filters: unknown };
}

/**
 * Build a fetch mock that emulates the three PostHog endpoints recompute uses:
 *  - GET feature_flags list  -> returns the flag with its multivariate variants
 *  - POST query (HogQL)      -> returns trial/conversion rows
 *  - PATCH feature_flags/:id -> records the new filters
 */
function makeFetch(state: MockState): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    const method = init?.method ?? "GET";

    if (u.includes("/feature_flags/") && method === "PATCH") {
      const idMatch = u.match(/feature_flags\/(\d+)\//);
      state.patched = {
        id: Number(idMatch?.[1]),
        filters: JSON.parse(String(init?.body)).filters,
      };
      return jsonResponse({ id: Number(idMatch?.[1]) });
    }

    if (u.includes("/feature_flags/") && method === "GET") {
      return jsonResponse({
        results: [
          {
            id: 42,
            key: "homepage-hero",
            filters: { multivariate: { variants: state.variants }, groups: [] },
          },
        ],
      });
    }

    if (u.includes("/query/") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const q: string = body.query.query;
      const isConversion = q.includes("$feature/");
      const src = isConversion ? state.conversions : state.trials;
      const results = Object.entries(src).map(([variant, n]) => [variant, n]);
      return jsonResponse({ results });
    }

    throw new Error(`unexpected request: ${method} ${u}`);
  }) as unknown as typeof fetch;
}

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const baseConn = {
  host: "https://us.posthog.com",
  projectId: "1",
  personalApiKey: "phx_test",
  experiments: [{ flagKey: "homepage-hero", conversionEvent: "signup_completed" }],
};

describe("recompute (PostHog pipeline)", () => {
  it("shifts rollout toward the higher-converting variant", async () => {
    const state: MockState = {
      variants: [
        { key: "control", rollout_percentage: 50 },
        { key: "test", rollout_percentage: 50 },
      ],
      // test converts far better: 200/1000 vs 100/1000
      trials: { control: 1000, test: 1000 },
      conversions: { control: 100, test: 200 },
    };

    const reports = await recompute({
      ...baseConn,
      fetchImpl: makeFetch(state),
      rng: mulberry32(1),
      maxStep: 1, // allow a big move so the direction is unambiguous in one run
      iterations: 3000,
    });

    const report = reports[0]!;
    const control = report.variants.find((v) => v.variant === "control")!;
    const test = report.variants.find((v) => v.variant === "test")!;

    expect(report.updated).toBe(true);
    expect(test.newPercentage).toBeGreaterThan(control.newPercentage);
    expect(test.newPercentage + control.newPercentage).toBe(100);

    // The PATCH body carried the same percentages back to PostHog.
    const patchedVariants = (state.patched!.filters as { multivariate: { variants: { key: string; rollout_percentage: number }[] } }).multivariate.variants;
    const patchedTest = patchedVariants.find((v) => v.key === "test")!;
    expect(patchedTest.rollout_percentage).toBe(test.newPercentage);
  });

  it("respects damping (maxStep) so rollout moves gradually", async () => {
    const state: MockState = {
      variants: [
        { key: "control", rollout_percentage: 50 },
        { key: "test", rollout_percentage: 50 },
      ],
      trials: { control: 1000, test: 1000 },
      conversions: { control: 50, test: 300 }, // test obviously better
    };

    const reports = await recompute({
      ...baseConn,
      fetchImpl: makeFetch(state),
      rng: mulberry32(2),
      maxStep: 0.1, // at most 10 percentage points of movement
      iterations: 3000,
    });

    const test = reports[0]!.variants.find((v) => v.variant === "test")!;
    // Started at 50, capped at +10pp -> ~60, never jumps straight to ~100.
    expect(test.newPercentage).toBeGreaterThan(50);
    expect(test.newPercentage).toBeLessThanOrEqual(61);
  });

  it("isolates a failing experiment so the rest still run (M5 regression)", async () => {
    const state: MockState = {
      variants: [
        { key: "control", rollout_percentage: 50 },
        { key: "test", rollout_percentage: 50 },
      ],
      trials: { control: 1000, test: 1000 },
      conversions: { control: 100, test: 300 },
    };

    const reports = await recompute({
      ...baseConn,
      fetchImpl: makeFetch(state),
      rng: mulberry32(7),
      experiments: [
        // First experiment references a flag the mock does not have.
        { flagKey: "deleted-flag", conversionEvent: "signup_completed" },
        { flagKey: "homepage-hero", conversionEvent: "signup_completed" },
      ],
    });

    expect(reports).toHaveLength(2);
    expect(reports[0]!.flagKey).toBe("deleted-flag");
    expect(reports[0]!.error).toMatch(/not found/i);
    expect(reports[0]!.updated).toBe(false);
    // The second experiment still ran and produced a real report.
    expect(reports[1]!.flagKey).toBe("homepage-hero");
    expect(reports[1]!.error).toBeUndefined();
    expect(reports[1]!.variants).toHaveLength(2);
  });

  it("does not PATCH when dryRun is set", async () => {
    const state: MockState = {
      variants: [
        { key: "control", rollout_percentage: 50 },
        { key: "test", rollout_percentage: 50 },
      ],
      trials: { control: 1000, test: 1000 },
      conversions: { control: 100, test: 300 },
    };

    const reports = await recompute({
      ...baseConn,
      fetchImpl: makeFetch(state),
      rng: mulberry32(3),
      dryRun: true,
    });

    expect(reports[0]!.updated).toBe(false);
    expect(state.patched).toBeUndefined();
  });
});
