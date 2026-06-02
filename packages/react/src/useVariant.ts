import { useCallback, useEffect, useState } from "react";
import { usePostHog } from "posthog-js/react";

export interface UseVariantOptions {
  /**
   * Lock the first resolved variant in localStorage so the user keeps seeing
   * the same variant even after the bandit changes rollout percentages
   * (mitigates PostHog's boundary re-bucketing). Per-browser only; cross-device
   * stickiness is still handled by PostHog's deterministic hashing.
   * Default false.
   */
  stickyLock?: boolean;
  /** Value returned while flags are still loading. Default undefined. */
  fallback?: string;
}

export interface UseVariantResult {
  /** The assigned variant key, or `fallback` while loading. */
  variant: string | undefined;
  /** True until PostHog has resolved feature flags at least once. */
  isLoading: boolean;
  /**
   * Report a conversion for this experiment. PostHog automatically stamps the
   * active variant onto the event via its `$feature/<flagKey>` property, so the
   * recompute job can attribute it. Pass the conversion event name.
   */
  track: (eventName: string, properties?: Record<string, unknown>) => void;
}

function storageKey(flagKey: string): string {
  return `mab-kit:variant:${flagKey}`;
}

function readLocked(flagKey: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(storageKey(flagKey)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeLocked(flagKey: string, variant: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(flagKey), variant);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Subscribe to a PostHog multivariate feature flag and expose the assigned
 * variant plus a `track` helper for reporting conversions.
 *
 * Requires a PostHogProvider (from `posthog-js/react`) above this component.
 */
export function useVariant(
  flagKey: string,
  options: UseVariantOptions = {},
): UseVariantResult {
  const { stickyLock = false, fallback } = options;
  const posthog = usePostHog();

  const [variant, setVariant] = useState<string | undefined>(() =>
    stickyLock ? readLocked(flagKey) : undefined,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!posthog) return;

    const resolve = () => {
      // If locked to a previous variant, keep it.
      if (stickyLock) {
        const locked = readLocked(flagKey);
        if (locked) {
          setVariant(locked);
          setIsLoading(false);
          return;
        }
      }
      const value = posthog.getFeatureFlag(flagKey);
      const next = typeof value === "string" ? value : undefined;
      if (next !== undefined) {
        if (stickyLock) writeLocked(flagKey, next);
        setVariant(next);
      }
      setIsLoading(false);
    };

    // Resolve immediately if flags are already loaded, and subscribe for updates.
    resolve();
    const unsubscribe = posthog.onFeatureFlags(() => resolve());
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [posthog, flagKey, stickyLock]);

  const track = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      posthog?.capture(eventName, properties);
    },
    [posthog],
  );

  return { variant: variant ?? fallback, isLoading, track };
}
