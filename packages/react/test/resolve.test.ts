import { describe, it, expect } from "vitest";
import { resolveVariantValue } from "../src/resolve.js";

const values = { control: "A", test: "B" };

describe("resolveVariantValue", () => {
  it("returns the value for the assigned variant", () => {
    expect(resolveVariantValue("test", values)).toBe("B");
    expect(resolveVariantValue("control", values)).toBe("A");
  });

  it("falls back to defaultVariant when variant is undefined", () => {
    expect(resolveVariantValue(undefined, values, "control")).toBe("A");
  });

  it("falls back to defaultVariant when variant is unknown", () => {
    expect(resolveVariantValue("unknown", values, "test")).toBe("B");
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveVariantValue("unknown", values)).toBeUndefined();
    expect(resolveVariantValue(undefined, values)).toBeUndefined();
  });

  it("handles falsy values without treating them as missing", () => {
    const map = { control: 0, test: 1 };
    expect(resolveVariantValue("control", map)).toBe(0);
  });
});
