# mab-kit

> Multi-Armed Bandit experimentation for the web — start at 50:50, then send
> more traffic to whatever's winning. Powered by PostHog, no database to run.

A classic A/B test keeps a fixed 50:50 split for the whole experiment, so half
your users see the losing variant the entire time. A **Multi-Armed Bandit (MAB)**
starts balanced but **gradually shifts traffic toward the better variant** as
conversions come in — exploring and exploiting at once, so fewer users get the
worse experience while you learn.

mab-kit implements **Beta-Bernoulli Thompson Sampling** and uses **PostHog** as
the place where stats live and variants are delivered. You don't operate any
aggregation store — PostHog already collects exposures and conversions, and a
small periodic job rewrites your feature flag's rollout percentages.

## How it works

```
 ┌────────────┐   exposures + conversions    ┌──────────────────────┐
 │  Your app  │ ───────────────────────────▶ │       PostHog        │
 │ useVariant │ ◀─────────────────────────── │  (events + flags)    │
 └────────────┘     variant (sticky)         └──────────┬───────────┘
                                                 reads stats │ writes rollout %
                                                            ▼
                                              ┌──────────────────────────┐
                                              │  recompute (cron, ~15m)  │
                                              │  Thompson Sampling brain │
                                              └──────────────────────────┘
```

1. **Collect** — PostHog already emits `$feature_flag_called` on every flag
   evaluation (your exposures) and stamps each event with `$feature/<flag>`
   (so any conversion event is attributed to its variant). Nothing to build.
2. **Decide** — a periodic job reads per-variant `{trials, conversions}` via
   HogQL, forms a `Beta(1+conversions, 1+failures)` posterior per variant, and
   runs **population-level Thompson Sampling**: it estimates each variant's
   probability of being best and uses that as its traffic weight.
3. **Apply** — it PATCHes those weights into the PostHog multivariate flag's
   `rollout_percentage`s (with damping + an exploration floor for safety).
4. **Deliver** — your client reads the flag with `useVariant`; PostHog assigns
   variants deterministically per user.

### The "weird formula": Thompson Sampling

Each variant's true conversion rate `p` is modelled as a Beta posterior. To
allocate traffic we draw one sample `θ ~ Beta(α, β)` per variant and favour the
argmax. With little data the posteriors are wide, so allocation stays near
50:50 (exploration); as evidence accrues the better variant is sampled highest
almost always, so its share rises on its own — no manual schedule. See
[`packages/core`](./packages/core).

## Packages

| Package | What it is |
| --- | --- |
| [`@mab-kit/core`](./packages/core) | Framework-agnostic algorithm. Beta sampling, `probabilityOfBest`, weight shaping. Zero dependencies. |
| [`@mab-kit/posthog`](./packages/posthog) | Reads stats via HogQL, writes rollout % via the flags API. `recompute()` + `createMABCronRoute()`. |
| [`@mab-kit/react`](./packages/react) | `useVariant(flagKey)` hook — assigned variant + `track()` + optional `stickyLock`. |

See [`examples/next`](./examples/next) for a full Next.js + Vercel Cron setup.

## Quick start

```bash
pnpm add @mab-kit/react @mab-kit/posthog posthog-js
```

**Client** — read the variant and report conversions:

```tsx
"use client";
import { useVariant } from "@mab-kit/react";

export function Hero() {
  const { variant, track } = useVariant("homepage-hero", { stickyLock: true });
  return (
    <button onClick={() => track("signup_completed")}>
      {variant === "test" ? "Start free" : "Get started"}
    </button>
  );
}
```

**Server** — recompute on a schedule (Next.js Route Handler + Vercel Cron):

```ts
// app/api/mab/recompute/route.ts
import { createMABCronRoute } from "@mab-kit/posthog";

export const GET = createMABCronRoute({
  host: process.env.POSTHOG_HOST!,            // e.g. https://us.posthog.com
  projectId: process.env.POSTHOG_PROJECT_ID!,
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  cronSecret: process.env.CRON_SECRET,
  experiments: [{ flagKey: "homepage-hero", conversionEvent: "signup_completed" }],
});
export const dynamic = "force-dynamic";
```

### PostHog setup

1. Create a **multivariate** feature flag (e.g. `homepage-hero`) with your
   variants, started at an even split.
2. Make sure your conversion events fire while the flag is loaded so PostHog
   attaches `$feature/<flag>` to them.
3. Create a **personal API key** for the recompute job (server-side only).

## Trade-off to know

PostHog assigns variants by hashing `distinct_id + flag_key` against the
cumulative rollout boundaries, so **changing rollout percentages can move some
boundary users to a different variant**. mab-kit mitigates this with:

- **Damping** (`maxStep`) — caps how far weights move per run.
- **`stickyLock`** — pins a returning visitor to their first variant in the
  same browser (cross-device stickiness still comes from PostHog).

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## License

MIT
