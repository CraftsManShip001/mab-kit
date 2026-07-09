import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Fake PostHog client. `flagValue` controls what getFeatureFlag returns.
 * With `deferFlags = true`, flags behave as not-yet-loaded: getFeatureFlag
 * returns undefined and the onFeatureFlags callback is held until
 * `loadFlags()` is called (mirrors real posthog-js behavior).
 */
const captureSpy = vi.fn();
let flagValue: string | boolean | undefined = "test";
let deferFlags = false;
let heldFlagCallbacks: Array<() => void> = [];

const getFeatureFlagSpy = vi.fn(() => (deferFlags ? undefined : flagValue));

function loadFlags() {
  deferFlags = false;
  const cbs = heldFlagCallbacks;
  heldFlagCallbacks = [];
  cbs.forEach((cb) => cb());
}

const fakePostHog = {
  getFeatureFlag: getFeatureFlagSpy,
  onFeatureFlags: (cb: () => void) => {
    if (deferFlags) {
      heldFlagCallbacks.push(cb);
    } else {
      cb();
    }
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
  getFeatureFlagSpy.mockClear();
  flagValue = "test";
  deferFlags = false;
  heldFlagCallbacks = [];
  window.localStorage.clear();
});

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

describe("useVariant", () => {
  it("resolves the assigned variant and stops loading", () => {
    render(<Probe />);
    expect(screen.getByTestId("variant").textContent).toBe("test");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("keeps isLoading=true until flags actually load (M1 regression)", () => {
    deferFlags = true;
    render(<Probe />);
    // Flags not loaded yet: must still be loading, not flashing fallback.
    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("variant").textContent).toBe("");

    act(() => loadFlags());
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("variant").textContent).toBe("test");
  });

  it("track() stamps the displayed variant onto the event (C1a regression)", () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("go"));
    expect(captureSpy).toHaveBeenCalledWith("signup_completed", {
      "$feature/homepage-hero": "test",
      plan: "pro",
    });
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

  it("stickyLock still evaluates the flag so exposure fires (C1b regression)", () => {
    flagValue = "control";
    const { unmount } = render(<StickyProbe />);
    unmount();

    getFeatureFlagSpy.mockClear();
    flagValue = "test"; // PostHog re-bucketed this user
    render(<StickyProbe />);
    // Displays the locked variant but MUST still call getFeatureFlag —
    // that call is what emits $feature_flag_called (the trial count).
    expect(screen.getByTestId("variant").textContent).toBe("control");
    expect(getFeatureFlagSpy).toHaveBeenCalled();
  });

  it("stickyLock track() attributes conversions to the SEEN variant, not PostHog's (C1a regression)", () => {
    flagValue = "control";
    const { unmount } = render(<StickyProbe />);
    unmount();

    flagValue = "test"; // PostHog now assigns "test", user still sees locked "control"
    render(<StickyProbe />);
    fireEvent.click(screen.getByText("convert"));
    expect(captureSpy).toHaveBeenCalledWith("signup_completed", {
      "$feature/homepage-hero": "control",
    });
  });
});

function StickyProbe() {
  const { variant, track } = useVariant("homepage-hero", { stickyLock: true });
  return (
    <div>
      <span data-testid="variant">{variant}</span>
      <button onClick={() => track("signup_completed")}>convert</button>
    </div>
  );
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

  it("shows the loading node until flags load", () => {
    deferFlags = true;
    render(
      <Experiment flag="homepage-hero" loading={<p>Loading…</p>}>
        <Variant name="test">
          <p>Hero B</p>
        </Variant>
      </Experiment>,
    );
    expect(screen.queryByText("Loading…")).not.toBeNull();
    expect(screen.queryByText("Hero B")).toBeNull();

    act(() => loadFlags());
    expect(screen.queryByText("Hero B")).not.toBeNull();
  });

  it("throws if <Variant> is used outside <Experiment>", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Variant name="x">y</Variant>)).toThrow(
      /must be used inside an <Experiment>/,
    );
    spy.mockRestore();
  });
});
