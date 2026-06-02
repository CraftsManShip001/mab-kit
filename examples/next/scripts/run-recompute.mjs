// Quick real-PostHog test of the recompute pipeline.
// Run from examples/next:  node --env-file=.env.local scripts/run-recompute.mjs [--apply]
import { recompute } from "@mab-kit/posthog";

const apply = process.argv.includes("--apply");

const reports = await recompute({
  host: process.env.POSTHOG_HOST,
  projectId: process.env.POSTHOG_PROJECT_ID,
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
  experiments: [{ flagKey: "homepage-hero", conversionEvent: "signup_completed" }],
  lookbackDays: 30,
  dryRun: !apply,
});

console.log(apply ? "=== APPLIED ===" : "=== DRY RUN ===");
console.log(JSON.stringify(reports, null, 2));
