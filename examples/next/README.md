# mab-kit · Next.js example

End-to-end demo of a Multi-Armed Bandit experiment driven by PostHog.

## What it shows

- `app/page.tsx` — a client component reading the assigned variant with
  `useVariant("homepage-hero")` and reporting a conversion via `track(...)`.
- `app/api/mab/recompute/route.ts` — the Thompson-Sampling recompute job wired
  as a Next Route Handler with `createMABCronRoute(...)`.
- `vercel.json` — a Vercel Cron schedule that hits the recompute route every 15
  minutes.

## Setup

1. In PostHog, create a **multivariate** feature flag with key `homepage-hero`
   and variants `control` / `test` (start them at 50/50).
2. Create a **personal API key** (Settings → Personal API keys) with feature
   flag + query scopes.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Install and run (this example is standalone — install inside this folder):

   ```bash
   pnpm install
   pnpm dev
   ```

## Verifying the bandit moves

- Open the page a few times and click the CTA to emit `signup_completed`
  conversions. Exposures (`$feature_flag_called`) are sent automatically.
- Trigger a recompute manually:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/mab/recompute
  ```

- The JSON response reports each variant's trials/conversions and the new
  rollout percentage. Check the flag in PostHog — the better-converting
  variant's `rollout_percentage` should rise over successive runs (bounded by
  `maxStep` per run).
