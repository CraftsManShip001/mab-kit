import { createMABCronRoute } from "@mab-kit/posthog";

// Runs the Thompson-Sampling recompute and PATCHes new rollout percentages.
// Triggered periodically by Vercel Cron (see vercel.json). Protected by
// CRON_SECRET so it can't be invoked by the public.
export const GET = createMABCronRoute({
  host: process.env.POSTHOG_HOST!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  cronSecret: process.env.CRON_SECRET,
  // Move gently and keep a small exploration floor.
  maxStep: 0.1,
  minWeight: 0.02,
  lookbackDays: 14,
  experiments: [
    { flagKey: "homepage-hero", conversionEvent: "signup_completed" },
  ],
});

export const dynamic = "force-dynamic";
