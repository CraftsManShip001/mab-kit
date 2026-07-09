import { describe, it, expect } from "vitest";
import { createMABCronRoute } from "../src/index.js";

/** Minimal happy-path PostHog mock: one multivariate flag + empty stats. */
const okFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = typeof url === "string" ? url : url.toString();
  const method = init?.method ?? "GET";
  if (u.includes("/feature_flags/") && method === "GET") {
    return jsonResponse({
      results: [
        {
          id: 1,
          key: "exp",
          filters: {
            multivariate: {
              variants: [
                { key: "control", rollout_percentage: 50 },
                { key: "test", rollout_percentage: 50 },
              ],
            },
          },
        },
      ],
    });
  }
  if (u.includes("/query/")) return jsonResponse({ results: [] });
  return jsonResponse({});
}) as unknown as typeof fetch;

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const base = {
  host: "https://us.posthog.com",
  projectId: "1",
  personalApiKey: "phx_test",
  fetchImpl: okFetch,
  experiments: [{ flagKey: "exp", conversionEvent: "converted" }],
};

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/mab/recompute", { headers });
}

describe("createMABCronRoute auth", () => {
  it("fails closed when cronSecret is missing (M3 regression)", async () => {
    const handler = createMABCronRoute({ ...base });
    const res = await handler(req());
    expect(res.status).toBe(401);
  });

  it("runs without auth only when allowUnauthenticated is explicit", async () => {
    const handler = createMABCronRoute({ ...base, allowUnauthenticated: true });
    const res = await handler(req());
    expect(res.status).toBe(200);
  });

  it("rejects a wrong bearer token", async () => {
    const handler = createMABCronRoute({ ...base, cronSecret: "s3cret" });
    const res = await handler(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("accepts the correct bearer token and returns reports", async () => {
    const handler = createMABCronRoute({ ...base, cronSecret: "s3cret" });
    const res = await handler(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reports: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.reports).toHaveLength(1);
  });
});
