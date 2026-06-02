import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Fake PostHog client. `flagValue` controls what getFeatureFlag returns;
 * onFeatureFlags fires its callback immediately (flags "already loaded").
 */
const captureSpy = vi.fn();
let flagValue: string | boolean | undefined = "test";

const fakePostHog = {
  getFeatureFlag: () => flagValue,
  onFeatureFlags: (cb: () => void) => {
    cb();
    return () => {};
  },
  capture: captureSpy,
};

// Mock the provider hook so no real PostHogProvider is needed.
vi.mock("posthog-js/react", () => ({
  usePostHog: () => fakePostHog,
}));

// Import AFTER the mock is registered.
import { useVariant, useVariantValue, Experiment, Variant } from "../src/index.js";

beforeEach(() => {
  captureSpy.mockClear();
  flagValue = "test";
  window.localStorage.clear();
});

describe("useVariant", () => {
  function Probe() {
    const { variant, isLoading, track } = useVariant("homepage-hero");
    return (
      <div>
        <span data-testid="variant">{variant}</span>
        <span data-testid="loading">{String(isLoading)}</span>
        <button onClick={() => track("signup_completed", { plan: "pro" })}>go</button>
      </div>
    );
  }

  it("resolves the assigned variant and stops loading", () => {
    render(<Probe />);
    expect(screen.getByTestId("variant").textContent).toBe("test");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("track() forwards the event and properties to posthog.capture", () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("go"));
    expect(captureSpy).toHaveBeenCalledWith("signup_completed", { plan: "pro" });
  });

  it("stickyLock pins the first variant even after the flag changes", () => {
    flagValue = "control";
    const { unmount } = render(<StickyProbe />);
    expect(screen.getByTestId("variant").textContent).toBe("control");
    unmount();

    // Flag now flips to "test", but the locked value should win.
    flagValue = "test";
    render(<StickyProbe />);
    expect(screen.getByTestId("variant").textContent).toBe("control");
  });
});

function StickyProbe() {
  const { variant } = useVariant("homepage-hero", { stickyLock: true });
  return <span data-testid="variant">{variant}</span>;
}

describe("useVariantValue", () => {
  function Probe() {
    const hero = useVariantValue(
      "homepage-hero",
      {
        control: { title: "Get started" },
        test: { title: "Start free" },
      },
      { defaultVariant: "control" },
    );
    return <h1>{hero?.title}</h1>;
  }

  it("maps the variant to its value", () => {
    flagValue = "test";
    render(<Probe />);
    expect(screen.getByRole("heading").textContent).toBe("Start free");
  });

  it("falls back to defaultVariant for an unknown flag value", () => {
    flagValue = undefined;
    render(<Probe />);
    expect(screen.getByRole("heading").textContent).toBe("Get started");
  });
});

describe("<Experiment> / <Variant>", () => {
  function App() {
    return (
      <Experiment flag="homepage-hero">
        <Variant name="control">
          <p>Hero A</p>
        </Variant>
        <Variant name="test">
          <p>Hero B</p>
        </Variant>
      </Experiment>
    );
  }

  it("renders only the matching variant's block", () => {
    flagValue = "test";
    render(<App />);
    expect(screen.queryByText("Hero B")).not.toBeNull();
    expect(screen.queryByText("Hero A")).toBeNull();
  });

  it("switches block when the assigned variant differs", () => {
    flagValue = "control";
    render(<App />);
    expect(screen.queryByText("Hero A")).not.toBeNull();
    expect(screen.queryByText("Hero B")).toBeNull();
  });

  it("throws if <Variant> is used outside <Experiment>", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Variant name="x">y</Variant>)).toThrow(
      /must be used inside an <Experiment>/,
    );
    spy.mockRestore();
  });
});
