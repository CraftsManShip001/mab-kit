import type { PostHogConnection, PostHogFeatureFlag } from "./types.js";

/** Escape a single-quoted HogQL string literal. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Thin wrapper over the PostHog REST + Query APIs. All calls authenticate with
 * a personal API key and target a single project.
 */
export class PostHogClient {
  private readonly host: string;
  private readonly projectId: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(conn: PostHogConnection) {
    this.host = conn.host.replace(/\/+$/, "");
    this.projectId = String(conn.projectId);
    this.key = conn.personalApiKey;
    const f = conn.fetchImpl ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        "PostHogClient: no fetch available. Provide `fetchImpl` or run on a runtime with global fetch.",
      );
    }
    this.fetchImpl = f;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.host}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog API ${res.status} ${res.statusText} for ${path}: ${body}`);
    }
    return (await res.json()) as T;
  }

  /** Run a HogQL query and return its raw rows (`results`). */
  async hogql(query: string): Promise<unknown[][]> {
    const data = await this.request<{ results: unknown[][] }>(
      `/api/projects/${this.projectId}/query/`,
      {
        method: "POST",
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      },
    );
    return data.results ?? [];
  }

  /**
   * Aggregate per-variant exposure counts from `$feature_flag_called` events.
   * Returns a map of variant key -> trial count.
   */
  async getTrials(
    flagKey: string,
    lookbackDays: number,
    dedupeByPerson: boolean,
  ): Promise<Map<string, number>> {
    const counter = dedupeByPerson ? "count(DISTINCT person_id)" : "count()";
    const query = `
      SELECT properties.$feature_flag_response AS variant, ${counter} AS n
      FROM events
      WHERE event = '$feature_flag_called'
        AND properties.$feature_flag = '${esc(flagKey)}'
        AND timestamp >= now() - INTERVAL ${Number(lookbackDays)} DAY
        AND variant IS NOT NULL
      GROUP BY variant
    `;
    return this.rowsToMap(await this.hogql(query));
  }

  /**
   * Aggregate per-variant conversion counts. PostHog stamps each event with a
   * `$feature/<flagKey>` property recording which variant was active.
   */
  async getConversions(
    flagKey: string,
    conversionEvent: string,
    lookbackDays: number,
    dedupeByPerson: boolean,
  ): Promise<Map<string, number>> {
    const counter = dedupeByPerson ? "count(DISTINCT person_id)" : "count()";
    const prop = `properties.\`$feature/${esc(flagKey)}\``;
    const query = `
      SELECT ${prop} AS variant, ${counter} AS n
      FROM events
      WHERE event = '${esc(conversionEvent)}'
        AND ${prop} IS NOT NULL
        AND timestamp >= now() - INTERVAL ${Number(lookbackDays)} DAY
      GROUP BY variant
    `;
    return this.rowsToMap(await this.hogql(query));
  }

  private rowsToMap(rows: unknown[][]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
      const variant = row[0];
      const n = row[1];
      if (typeof variant === "string" && variant.length > 0) {
        map.set(variant, Number(n) || 0);
      }
    }
    return map;
  }

  /** Look up a feature flag by key. Throws if not found. */
  async getFeatureFlagByKey(flagKey: string): Promise<PostHogFeatureFlag> {
    const data = await this.request<{ results: PostHogFeatureFlag[] }>(
      `/api/projects/${this.projectId}/feature_flags/?limit=300`,
    );
    const flag = (data.results ?? []).find((f) => f.key === flagKey);
    if (!flag) {
      throw new Error(`PostHog feature flag with key "${flagKey}" not found.`);
    }
    return flag;
  }

  /** Fetch a feature flag by numeric id. */
  async getFeatureFlagById(id: number): Promise<PostHogFeatureFlag> {
    return this.request<PostHogFeatureFlag>(
      `/api/projects/${this.projectId}/feature_flags/${id}/`,
    );
  }

  /**
   * PATCH a feature flag's filters (only). Caller passes the full filters
   * object with updated rollout percentages; we preserve everything else.
   */
  async updateFilters(
    id: number,
    filters: PostHogFeatureFlag["filters"],
  ): Promise<PostHogFeatureFlag> {
    return this.request<PostHogFeatureFlag>(
      `/api/projects/${this.projectId}/feature_flags/${id}/`,
      { method: "PATCH", body: JSON.stringify({ filters }) },
    );
  }
}
