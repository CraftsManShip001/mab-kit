# @mab-kit/posthog

PostHog adapter for [mab-kit](https://github.com/CraftsManShip001/mab-kit). Reads per-variant
exposure/conversion stats via HogQL and drives a multivariate feature flag's
rollout percentages with Thompson Sampling. **No database to operate** —
PostHog is the stats + delivery layer.

```bash
pnpm add @mab-kit/posthog
```

## Usage

### As a scheduled function

```ts
import { recompute } from "@mab-kit/posthog";

const reports = await recompute({
  host: process.env.POSTHOG_HOST!,            // https://us.posthog.com
  projectId: process.env.POSTHOG_PROJECT_ID!,
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  experiments: [{ flagKey: "homepage-hero", conversionEvent: "signup_completed" }],
  // optional tuning
  lookbackDays: 14,
  maxStep: 0.1,      // damping: max rollout change per variant per run
  minWeight: 0.02,   // exploration floor
  dedupeByPerson: true,
  dryRun: false,
});
```

### As a Next.js Route Handler (+ Vercel Cron)

```ts
// app/api/mab/recompute/route.ts
import { createMABCronRoute } from "@mab-kit/posthog";

export const GET = createMABCronRoute({
  host: process.env.POSTHOG_HOST!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  cronSecret: process.env.CRON_SECRET, // verifies Vercel Cron's Authorization header
  experiments: [{ flagKey: "homepage-hero", conversionEvent: "signup_completed" }],
});
export const dynamic = "force-dynamic";
```

## Requirements

- A **multivariate** PostHog feature flag (≥ 2 variants).
- A **personal API key** with feature-flag and query access (server-side only).
- Conversion events fired while flags are loaded (so PostHog attaches
  `$feature/<flagKey>`).

## License

MIT
