import { recompute, type RecomputeConfig } from "./recompute.js";

export interface CronRouteConfig extends RecomputeConfig {
  /**
   * If set, incoming requests must carry `Authorization: Bearer <cronSecret>`.
   * Vercel Cron automatically sends this header when CRON_SECRET is configured.
   *
   * If NOT set, the route fails closed (every request gets 401) unless
   * `allowUnauthenticated` is explicitly true — a forgotten env var must not
   * silently expose a public endpoint that rewrites production feature flags.
   */
  cronSecret?: string;
  /** Explicitly run the route without authentication. NOT recommended. */
  allowUnauthenticated?: boolean;
}

/**
 * Build a Web-standard request handler that runs `recompute` and returns a JSON
 * report. Compatible with Next.js Route Handlers (App Router), which use the
 * Web `Request`/`Response` types — no Next import needed.
 *
 * Usage (app/api/mab/recompute/route.ts):
 *
 *   import { createMABCronRoute } from "@mab-kit/posthog";
 *   export const GET = createMABCronRoute({
 *     host: process.env.POSTHOG_HOST!,
 *     projectId: process.env.POSTHOG_PROJECT_ID!,
 *     personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
 *     cronSecret: process.env.CRON_SECRET,
 *     experiments: [{ flagKey: "homepage-hero", conversionEvent: "signup_completed" }],
 *   });
 *   export const dynamic = "force-dynamic";
 */
export function createMABCronRoute(
  config: CronRouteConfig,
): (request: Request) => Promise<Response> {
  const { cronSecret, allowUnauthenticated, ...recomputeConfig } = config;

  return async function handler(request: Request): Promise<Response> {
    if (cronSecret) {
      const auth = request.headers.get("authorization") ?? "";
      if (!timingSafeEqual(auth, `Bearer ${cronSecret}`)) {
        return json({ error: "Unauthorized" }, 401);
      }
    } else if (!allowUnauthenticated) {
      return json(
        {
          error:
            "cronSecret is not configured. Set it (e.g. from CRON_SECRET), or pass allowUnauthenticated: true to run an open endpoint.",
        },
        401,
      );
    }

    try {
      const reports = await recompute(recomputeConfig);
      return json({ ok: true, reports }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ ok: false, error: message }, 500);
    }
  };
}

/**
 * Constant-time string comparison, implemented on top of Web APIs only so the
 * route stays edge-runtime compatible (no node:crypto).
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
