import { useVariant, type UseVariantOptions } from "./useVariant.js";
import { resolveVariantValue } from "./resolve.js";

export interface UseVariantValueOptions extends UseVariantOptions {
  /**
   * Which key in the value map to use while flags are loading or when the
   * assigned variant has no matching entry. Recommended so the hook never
   * returns undefined.
   */
  defaultVariant?: string;
}

/**
 * Map a feature-flag variant directly to a value, avoiding `variant === "..."`
 * branching. Pass an object keyed by variant; you get back the value for the
 * assigned variant.
 *
 * ```tsx
 * const hero = useVariantValue("homepage-hero", {
 *   control: { title: "Get started", cta: "Sign up" },
 *   test:    { title: "Start free",  cta: "Try it" },
 * }, { defaultVariant: "control" });
 *
 * return <h1>{hero?.title}</h1>;
 * ```
 */
export function useVariantValue<T>(
  flagKey: string,
  values: Record<string, T>,
  options: UseVariantValueOptions = {},
): T | undefined {
  const { defaultVariant, ...variantOptions } = options;
  const { variant } = useVariant(flagKey, {
    ...variantOptions,
    fallback: variantOptions.fallback ?? defaultVariant,
  });
  return resolveVariantValue(variant, values, defaultVariant);
}
