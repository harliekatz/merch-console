import { describe, expect, it } from "vitest";
import { probability, probabilityValue, percent, days } from "./format";

describe("probability", () => {
  it("does not round a modeled 99.97% up to certainty", () => {
    // Rounding to whole percent displayed 0.9997 as "100%", which asserts a
    // certainty the model never produces.
    expect(probability(0.9997)).toBe(">99%");
    expect(probability(0.995)).toBe(">99%");
  });

  it("does not round a small risk down to zero", () => {
    expect(probability(0.0001)).toBe("<1%");
    expect(probability(0.004)).toBe("<1%");
  });

  it("shows an exact zero and an exact one without a bound", () => {
    expect(probability(0)).toBe("0%");
    expect(probability(1)).toBe(">99%");
  });

  it("rounds normally in the middle of the range", () => {
    expect(probability(0.5)).toBe("50%");
    expect(probability(0.42)).toBe("42%");
    expect(probability(0.986)).toBe("99%");
  });

  it("clamps out-of-range and non-finite input rather than printing it", () => {
    expect(probability(1.4)).toBe(">99%");
    expect(probability(-3)).toBe("0%");
    expect(probability(Number.NaN)).toBe("0%");
  });

  it("uses the same bounds in the CSV variant, without a percent sign", () => {
    expect(probabilityValue(0.9997)).toBe(">99");
    expect(probabilityValue(0.0001)).toBe("<1");
    expect(probabilityValue(0.5)).toBe("50");
  });
});

describe("percent and days", () => {
  it("still rounds plainly, since it is used for shares rather than probabilities", () => {
    expect(percent(0.9997)).toBe("100%");
    expect(percent(0.335, 1)).toBe("33.5%");
  });

  it("renders an infinite cover figure as a dash", () => {
    expect(days(Number.POSITIVE_INFINITY)).toBe("—");
    expect(days(26.4)).toBe("26d");
    expect(days(5000)).toBe("999+");
  });
});
