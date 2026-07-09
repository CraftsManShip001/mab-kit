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
   * Report a conversion for this experiment. The event is stamped with the
   * variant the user actually saw (`$feature/<flagKey>`), which takes
   * precedence over posthog-js's auto-stamp — required for correct attribution
   * when `stickyLock` displays a variant PostHog has since re-bucketed.
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

  // Deliberately NOT initialized from localStorage: the server renders
  // `undefined`, so reading the lock during the first client render would
  // cause a hydration mismatch. The effect below restores the lock post-mount.
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!posthog) return;

    const resolve = (flagsLoaded: boolean) => {
      // Always evaluate the flag — this is what makes PostHog record the
      // exposure ($feature_flag_called). A sticky lock may decide what we
      // DISPLAY, but it must never suppress the exposure event, or locked
      // users would convert without ever counting as trials.
      const value = posthog.getFeatureFlag(flagKey);
      const assigned = typeof value === "string" ? value : undefined;

      let next = assigned;
      if (stickyLock) {
        const locked = readLocked(flagKey);
        if (locked) {
          next = locked;
        } else if (assigned !== undefined) {
          writeLocked(flagKey, assigned);
        }
      }

      if (next !== undefined) setVariant(next);
      // Flags are "loaded" only when onFeatureFlags fired or the flag already
      // resolved to a value. A bare undefined before load must keep isLoading
      // true, otherwise consumers flash fallback content for the whole fetch.
      if (flagsLoaded || value !== undefined) setIsLoading(false);
    };

    resolve(false);
    const unsubscribe = posthog.onFeatureFlags(() => resolve(true));
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [posthog, flagKey, stickyLock]);

  const track = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      if (!posthog) return;
      // Stamp the DISPLAYED variant. posthog-js auto-attaches $feature/<flag>
      // from its own current assignment, which can differ from a sticky-locked
      // variant after rollout changes; explicit properties win the merge.
      posthog.capture(
        eventName,
        variant !== undefined
          ? { [`$feature/${flagKey}`]: variant, ...properties }
          : properties,
      );
    },
    [posthog, flagKey, variant],
  );

  return { variant: variant ?? fallback, isLoading, track };
}
