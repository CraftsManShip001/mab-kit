import {
  applyDamping,
  applyFloor,
  probabilityOfBest,
  statsFromCounts,
  toIntegerPercentages,
  type ArmStats,
} from "@mab-kit/core";
import { PostHogClient } from "./client.js";
import type {
  ExperimentConfig,
  ExperimentReport,
  PostHogConnection,
  PostHogFeatureFlag,
  RecomputeOptions,
  VariantReport,
} from "./types.js";

export interface RecomputeConfig extends PostHogConnection, RecomputeOptions {
  experiments: ExperimentConfig[];
}

const DEFAULTS = {
  lookbackDays: 14,
  iterations: 10_000,
  maxStep: 0.1,
  minWeight: 0.02,
  dedupeByPerson: true,
  dryRun: false,
} as const;

/**
 * Recompute Thompson-Sampling rollout weights for one experiment and (unless
 * dryRun) write them back to the PostHog feature flag.
 *
 * Pipeline: read counts (HogQL) -> Beta posteriors -> probabilityOfBest ->
 * floor -> damping (vs current rollout) -> integer percentages -> PATCH.
 */
export async function recomputeExperiment(
  client: PostHogClient,
  experiment: ExperimentConfig,
  opts: Required<RecomputeOptions>,
): Promise<ExperimentReport> {
  const flag: PostHogFeatureFlag = experiment.flagId
    ? await client.getFeatureFlagById(experiment.flagId)
    : await client.getFeatureFlagByKey(experiment.flagKey);

  const variants = flag.filters?.multivariate?.variants ?? [];
  if (variants.length < 2) {
    throw new Error(
      `Flag "${experiment.flagKey}" is not multivariate with >=2 variants; cannot run a bandit on it.`,
    );
  }

  const [trials, conversions] = await Promise.all([
    client.getTrials(experiment.flagKey, opts.lookbackDays, opts.dedupeByPerson),
    client.getConversions(
      experiment.flagKey,
      experiment.conversionEvent,
      opts.lookbackDays,
      opts.dedupeByPerson,
    ),
  ]);

  // Build posteriors in the flag's canonical variant order.
  const arms: ArmStats[] = variants.map((v) => {
    const t = trials.get(v.key) ?? 0;
    const c = Math.min(conversions.get(v.key) ?? 0, t); // conversions can't exceed trials
    return statsFromCounts({ id: v.key, trials: t, conversions: c });
  });

  // Population-level Thompson weights, with exploration floor + damping.
  const raw = probabilityOfBest(arms, { iterations: opts.iterations, rng: opts.rng });
  const floored = applyFloor(raw, opts.minWeight);
  const prevWeights = variants.map((v) => v.rollout_percentage / 100);
  const damped = applyDamping(prevWeights, floored, opts.maxStep);
  const percentages = toIntegerPercentages(damped, 100);

  const variantReports: VariantReport[] = variants.map((v, i) => ({
    variant: v.key,
    trials: trials.get(v.key) ?? 0,
    conversions: Math.min(conversions.get(v.key) ?? 0, trials.get(v.key) ?? 0),
    previousPercentage: v.rollout_percentage,
    newPercentage: percentages[i]!,
  }));

  const changed = variantReports.some((r) => r.newPercentage !== r.previousPercentage);

  if (!opts.dryRun && changed) {
    const nextFilters = {
      ...flag.filters,
      multivariate: {
        variants: variants.map((v, i) => ({
          ...v,
          rollout_percentage: percentages[i]!,
        })),
      },
    };
    await client.updateFilters(flag.id, nextFilters);
  }

  return {
    flagKey: experiment.flagKey,
    updated: !opts.dryRun && changed,
    variants: variantReports,
  };
}

/**
 * Recompute every configured experiment. This is the body a scheduled job
 * (e.g. Vercel Cron) should call periodically.
 */
export async function recompute(config: RecomputeConfig): Promise<ExperimentReport[]> {
  const client = new PostHogClient(config);
  const opts: Required<RecomputeOptions> = {
    lookbackDays: config.lookbackDays ?? DEFAULTS.lookbackDays,
    iterations: config.iterations ?? DEFAULTS.iterations,
    maxStep: config.maxStep ?? DEFAULTS.maxStep,
    minWeight: config.minWeight ?? DEFAULTS.minWeight,
    dedupeByPerson: config.dedupeByPerson ?? DEFAULTS.dedupeByPerson,
    dryRun: config.dryRun ?? DEFAULTS.dryRun,
    rng: config.rng ?? Math.random,
  };

  const reports: ExperimentReport[] = [];
  for (const experiment of config.experiments) {
    try {
      reports.push(await recomputeExperiment(client, experiment, opts));
    } catch (err) {
      // Isolate failures: one deleted/broken flag must not freeze the rollout
      // updates of every experiment configured after it.
      reports.push({
        flagKey: experiment.flagKey,
        updated: false,
        variants: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return reports;
}
