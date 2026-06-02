import { createContext, useContext, type ReactNode } from "react";
import { useVariant, type UseVariantOptions } from "./useVariant.js";

interface ExperimentContextValue {
  variant: string | undefined;
  isLoading: boolean;
}

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export interface ExperimentProps extends UseVariantOptions {
  /** The multivariate feature flag key. */
  flag: string;
  /** Optional content shown while flags are still loading. */
  loading?: ReactNode;
  /** `<Variant>` children (and other nodes). */
  children: ReactNode;
}

/**
 * Declarative experiment boundary. Resolves the variant once and lets each
 * `<Variant name="...">` child decide whether to render — no ternary soup.
 *
 * ```tsx
 * <Experiment flag="homepage-hero" loading={<Skeleton />}>
 *   <Variant name="control"><HeroA /></Variant>
 *   <Variant name="test"><HeroB /></Variant>
 * </Experiment>
 * ```
 */
export function Experiment({ flag, loading, children, ...options }: ExperimentProps) {
  const { variant, isLoading } = useVariant(flag, options);

  if (isLoading && loading !== undefined) {
    return <>{loading}</>;
  }

  return (
    <ExperimentContext.Provider value={{ variant, isLoading }}>
      {children}
    </ExperimentContext.Provider>
  );
}

export interface VariantProps {
  /** Variant key this block renders for. */
  name: string;
  children: ReactNode;
}

/**
 * Renders its children only when the surrounding `<Experiment>` resolved to
 * `name`. Must be used inside an `<Experiment>`.
 */
export function Variant({ name, children }: VariantProps) {
  const ctx = useContext(ExperimentContext);
  if (!ctx) {
    throw new Error("<Variant> must be used inside an <Experiment>.");
  }
  return ctx.variant === name ? <>{children}</> : null;
}
