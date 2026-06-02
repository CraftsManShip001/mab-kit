"use client";

import { useVariant } from "@mab-kit/react";

// The multivariate PostHog feature flag key driving this experiment.
const FLAG = "homepage-hero";

export default function HomePage() {
  // `stickyLock` keeps a returning visitor on their first variant even as the
  // bandit shifts rollout percentages over time.
  const { variant, isLoading, track } = useVariant(FLAG, { stickyLock: true });

  if (isLoading) return <main style={{ padding: 48 }}>Loading…</main>;

  // Render a different hero per variant. Add as many as the flag defines.
  const hero =
    variant === "test"
      ? { title: "Ship experiments without hurting users", cta: "Start free" }
      : { title: "A/B testing, evolved", cta: "Get started" };

  return (
    <main style={{ padding: 48, fontFamily: "system-ui" }}>
      <p style={{ color: "#888" }}>variant: {variant ?? "control"}</p>
      <h1>{hero.title}</h1>
      <button
        onClick={() => track("signup_completed")}
        style={{ padding: "12px 20px", fontSize: 16 }}
      >
        {hero.cta}
      </button>
    </main>
  );
}
