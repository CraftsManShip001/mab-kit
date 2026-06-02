/**
 * Pure variant-value selection, separated from React so it can be unit tested.
 *
 * Resolution order:
 *  1. the assigned `variant` if it exists in `values`
 *  2. the `defaultVariant` if it exists in `values`
 *  3. otherwise `undefined`
 */
export function resolveVariantValue<T>(
  variant: string | undefined,
  values: Record<string, T>,
  defaultVariant?: string,
): T | undefined {
  if (variant !== undefined && Object.prototype.hasOwnProperty.call(values, variant)) {
    return values[variant];
  }
  if (
    defaultVariant !== undefined &&
    Object.prototype.hasOwnProperty.call(values, defaultVariant)
  ) {
    return values[defaultVariant];
  }
  return undefined;
}
