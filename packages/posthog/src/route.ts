import { recompute, type RecomputeConfig } from "./recompute.js";

export interface CronRouteConfig extends RecomputeConfig {
  /**
   * If set, incoming requests must carry `Authorization: Bearer <cronSecret>`.
   * Vercel Cron automatically sends this header when CRON_SECRET is configured.
   */
  cronSecret?: string;
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
  const { cronSecret, ...recomputeConfig } = config;

  return async function handler(request: Request): Promise<Response> {
    if (cronSecret) {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return json({ error: "Unauthorized" }, 401);
      }
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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
