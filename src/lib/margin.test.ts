import { describe, expect, it } from "vitest";
import {
  CHANNEL_FEES,
  breakevenPrice,
  economics,
  feeRateFor,
  promoMath,
} from "./margin";
import type { Product } from "./types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    sku: "APP-1000",
    name: "Test Tee",
    categoryId: "apparel",
    vendorId: "v-01",
    status: "live",
    channels: ["web"],
    price: 40,
    unitCost: 14,
    priorUnitCost: 14,
    fulfilmentCost: 4,
    onHand: 100,
    onOrder: 0,
    committed: 0,
    hasImage: true,
    hasDescription: true,
    createdAt: "2025-01-01",
    updatedAt: "2026-08-01",
    ...overrides,
  };
}

describe("feeRateFor", () => {
  it("takes the worst channel, not an average", () => {
    // Any given unit can sell through the expensive channel. Averaging would
    // report a margin the product only achieves on a favourable mix.
    expect(feeRateFor(["web", "marketplace"])).toBe(CHANNEL_FEES.marketplace);
    expect(feeRateFor(["web", "wholesale"])).toBe(CHANNEL_FEES.web);
  });

  it("falls back to the web rate for a product with no channels", () => {
    expect(feeRateFor([])).toBe(CHANNEL_FEES.web);
  });
});

describe("economics", () => {
  it("subtracts cost, fulfilment and fees from price", () => {
    const unit = economics(product());
    expect(unit.fees).toBeCloseTo(40 * CHANNEL_FEES.web, 6);
    expect(unit.contribution).toBeCloseTo(40 - 14 - 4 - 40 * CHANNEL_FEES.web, 6);
    expect(unit.marginRate).toBeCloseTo(unit.contribution / 40, 6);
  });

  it("shows how much the marketplace fee costs on the same product", () => {
    const web = economics(product({ channels: ["web"] }));
    const marketplace = economics(product({ channels: ["web", "marketplace"] }));
    expect(marketplace.contribution).toBeLessThan(web.contribution);
    expect(web.contribution - marketplace.contribution).toBeCloseTo(
      40 * (CHANNEL_FEES.marketplace - CHANNEL_FEES.web),
      6,
    );
  });

  it("reports negative contribution rather than clamping at zero", () => {
    const unit = economics(product({ price: 15, unitCost: 14, fulfilmentCost: 4 }));
    expect(unit.contribution).toBeLessThan(0);
    expect(unit.marginRate).toBeLessThan(0);
  });

  it("computes cost drift against the prior snapshot", () => {
    expect(economics(product({ unitCost: 16.8, priorUnitCost: 14 })).costDrift)
      .toBeCloseTo(0.2, 6);
    expect(economics(product({ priorUnitCost: 0 })).costDrift).toBe(0);
  });

  it("honours a price override without mutating the product", () => {
    const item = product();
    const discounted = economics(item, 30);
    expect(discounted.price).toBe(30);
    expect(item.price).toBe(40);
  });

  it("does not divide by zero on a zero price", () => {
    expect(economics(product({ price: 0 })).marginRate).toBe(0);
  });
});

describe("breakevenPrice", () => {
  it("solves p = (cost + fulfilment) / (1 − fee)", () => {
    const item = product();
    const expected = (14 + 4) / (1 - CHANNEL_FEES.web);
    expect(breakevenPrice(item)).toBeCloseTo(expected, 6);
  });

  it("produces exactly zero contribution at that price", () => {
    const item = product({ channels: ["web", "marketplace"] });
    expect(economics(item, breakevenPrice(item)).contribution).toBeCloseTo(0, 9);
  });
});

describe("promoMath", () => {
  it("computes required lift as CM0 / CM1 − 1", () => {
    const item = product();
    const base = economics(item).contribution;
    const math = promoMath(item, "percent", 0.2);
    const promo = economics(item, 32).contribution;

    expect(math.promoPrice).toBeCloseTo(32, 6);
    expect(math.breakevenLift).toBeCloseTo(base / promo - 1, 6);
  });

  it("reproduces the claim the console makes about a 20% discount", () => {
    // On a roughly 45% contribution margin, 20% off needs about 80% more units
    // just to hold contribution flat. This is the number that surprises people.
    const item = product({ price: 100, unitCost: 46, fulfilmentCost: 6, channels: ["web"] });
    const math = promoMath(item, "percent", 0.2);

    expect(economics(item).marginRate).toBeGreaterThan(0.44);
    expect(math.breakevenLift).toBeGreaterThan(0.7);
    expect(math.breakevenLift).toBeLessThan(0.95);
  });

  it("requires more lift as the discount deepens", () => {
    const item = product();
    const ten = promoMath(item, "percent", 0.1).breakevenLift;
    const thirty = promoMath(item, "percent", 0.3).breakevenLift;
    expect(thirty).toBeGreaterThan(ten);
  });

  it("flags a discount that prices below cost, and reports infinite lift", () => {
    const item = product({ price: 20, unitCost: 14, fulfilmentCost: 4 });
    const math = promoMath(item, "percent", 0.5);

    expect(math.belowCost).toBe(true);
    expect(math.breakevenLift).toBe(Infinity);
  });

  it("handles dollar-amount discounts and never prices below zero", () => {
    const item = product();
    expect(promoMath(item, "amount", 10).promoPrice).toBe(30);
    expect(promoMath(item, "amount", 999).promoPrice).toBe(0);
  });

  it("computes the discount rate from the realised price", () => {
    expect(promoMath(product(), "amount", 10).discountRate).toBeCloseTo(0.25, 6);
  });
});
