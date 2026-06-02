// Inject synthetic exposure + conversion events into PostHog to demonstrate the
// bandit shifting traffic. Test data only; distinct_ids are prefixed mabkit-sim-.
//
// Run from examples/next:  node --env-file=.env.local scripts/inject-sim-events.mjs
const FLAG = "homepage-hero";
const CONV = "signup_completed";
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// control: 150 exposures / 15 conversions (10%) ; test: 150 / 45 (30%)
const plan = [
  { variant: "control", users: 150, conversions: 15 },
  { variant: "test", users: 150, conversions: 45 },
];

const batch = [];
for (const { variant, users, conversions } of plan) {
  for (let i = 0; i < users; i++) {
    const distinct_id = `mabkit-sim-${variant}-${i}`;
    // exposure
    batch.push({
      event: "$feature_flag_called",
      distinct_id,
      properties: { $feature_flag: FLAG, $feature_flag_response: variant },
    });
    // conversion for the first N users
    if (i < conversions) {
      batch.push({
        event: CONV,
        distinct_id,
        properties: { [`$feature/${FLAG}`]: variant },
      });
    }
  }
}

const res = await fetch(`${host.replace(/\/$/, "")}/batch/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ api_key: apiKey, batch }),
});

console.log("status:", res.status, await res.text());
console.log(`sent ${batch.length} events (${plan.map((p) => `${p.variant}:${p.users}/${p.conversions}`).join(", ")})`);
