import type { Rng } from "@mab-kit/core";

/** One PostHog multivariate variant as returned in a feature flag's filters. */
export interface PostHogVariant {
  key: string;
  rollout_percentage: number;
  name?: string;
}

/** Minimal shape of a PostHog feature flag we care about. */
export interface PostHogFeatureFlag {
  id: number;
  key: string;
  filters: {
    multivariate?: { variants: PostHogVariant[] };
    groups?: unknown[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** Connection details for the PostHog project (server-side use only). */
export interface PostHogConnection {
  /**
   * API host, e.g. "https://us.posthog.com" or "https://eu.posthog.com".
   * Use the API host, not the reverse-proxy ingest path.
   */
  host: string;
  /** Numeric or short-id PostHog project id. */
  projectId: string | number;
  /**
   * Personal API key (NOT the public project key). Required for the Query API
   * and feature-flag writes. Keep this server-side only.
   */
  personalApiKey: string;
  /** Inject a custom fetch (for tests or non-global-fetch runtimes). */
  fetchImpl?: typeof fetch;
}

/** One experiment = one multivariate feature flag + its conversion event. */
export interface ExperimentConfig {
  /** The multivariate feature flag key. */
  flagKey: string;
  /** The event name that counts as a conversion, e.g. "signup_completed". */
  conversionEvent: string;
  /**
   * Optional explicit flag id. If omitted, it is resolved from `flagKey`
   * via the feature-flags list endpoint.
   */
  flagId?: number;
}

export interface RecomputeOptions {
  /** How many days of events to aggregate over. Default 14. */
  lookbackDays?: number;
  /** Monte Carlo iterations for probabilityOfBest. Default 10000. */
  iterations?: number;
  /** Max rollout change per variant per run (damping), as a fraction. Default 0.1 (10pp). */
  maxStep?: number;
  /** Minimum weight floor per variant so none is fully starved. Default 0.02. */
  minWeight?: number;
  /** Count distinct persons rather than raw events. Default true. */
  dedupeByPerson?: boolean;
  /** Compute new rollout but do NOT write it back to PostHog. Default false. */
  dryRun?: boolean;
  /** Seeded RNG for deterministic weighting (tests). Default Math.random. */
  rng?: Rng;
}

/** Per-variant outcome of a recompute run. */
export interface VariantReport {
  variant: string;
  trials: number;
  conversions: number;
  previousPercentage: number;
  newPercentage: number;
}

/** Result of recomputing one experiment. */
export interface ExperimentReport {
  flagKey: string;
  updated: boolean;
  variants: VariantReport[];
}
