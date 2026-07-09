# @mab-kit/react

React hook for [mab-kit](https://github.com/CraftsManShip001/mab-kit). Reads a PostHog-driven bandit
variant and reports conversions.

```bash
pnpm add @mab-kit/react posthog-js react
```

Requires a `PostHogProvider` (from `posthog-js/react`) above your tree.

## Usage

```tsx
"use client";
import { useVariant } from "@mab-kit/react";

export function Hero() {
  const { variant, isLoading, track } = useVariant("homepage-hero", {
    stickyLock: true, // keep the same variant per browser across rollout changes
    fallback: "control",
  });

  if (isLoading) return null;

  return (
    <button onClick={() => track("signup_completed")}>
      {variant === "test" ? "Start free" : "Get started"}
    </button>
  );
}
```

### `useVariant(flagKey, options?)`

Returns `{ variant, isLoading, track }`.

- `variant` — assigned variant key (or `fallback` while loading).
- `track(eventName, properties?)` — capture a conversion; PostHog attributes it
  to the active variant automatically.
- `options.stickyLock` — pin the first variant in `localStorage`.
- `options.fallback` — value returned while flags load.

## Cleaner branching

Instead of `variant === "test" ? … : …`, pick whichever style reads best.

### `useVariantValue` — map a variant straight to a value

```tsx
const hero = useVariantValue("homepage-hero", {
  control: { title: "Get started", cta: "Sign up" },
  test:    { title: "Start free",  cta: "Try it" },
}, { defaultVariant: "control" });

return <h1>{hero?.title}</h1>;
```

Resolution: assigned variant → `defaultVariant` → `undefined`. Works for any
value type (objects, components, strings).

### `<Experiment>` / `<Variant>` — declarative UI blocks

```tsx
import { Experiment, Variant } from "@mab-kit/react";

<Experiment flag="homepage-hero" loading={<Skeleton />}>
  <Variant name="control"><HeroA /></Variant>
  <Variant name="test"><HeroB /></Variant>
</Experiment>
```

`<Experiment>` resolves the variant once; each `<Variant>` renders only when it
matches. `loading` is optional. Conversions can still be reported with
`useVariant(...).track` (or PostHog's `capture`) from inside the blocks.

## License

MIT
