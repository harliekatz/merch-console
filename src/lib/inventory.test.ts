import { describe, expect, it } from "vitest";
import {
  SERVICE_Z,
  VELOCITY_WINDOW,
  assess,
  available,
  daysOfCover,
  normalCdf,
  reorderPoint,
  safetyStock,
  stockoutRisk,
  velocityFor,
} from "./inventory";
import type { Product, SalesDay } from "./types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    sku: "APP-1000",
    name: "Test Tee",
    categoryId: "apparel",
    vendorId: "v-01",
    status: "live",
    channels: ["web"],
    price: 30,
    unitCost: 12,
    priorUnitCost: 12,
    fulfilmentCost: 3,
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

/** `perDay` units every day for `days` days. */
function steady(perDay: number, days = VELOCITY_WINDOW): SalesDay[] {
  return Array.from({ length: days }, (_, daysAgo) => ({
    sku: "APP-1000",
    daysAgo,
    units: perDay,
    revenue: perDay * 30,
  }));
}

describe("velocityFor", () => {
  it("averages over the whole window, not only the days with rows", () => {
    // Ten units on a single day is 10/28 a day, not 10 a day. Getting this
    // wrong would inflate velocity for every slow-moving SKU in the catalog.
    const velocity = velocityFor([{ sku: "APP-1000", daysAgo: 3, units: 10, revenue: 300 }]);
    expect(velocity.daily).toBeCloseTo(10 / 28, 6);
    expect(velocity.units).toBe(10);
    expect(velocity.sellingDays).toBe(1);
  });

  it("reports zero variance on perfectly steady demand", () => {
    const velocity = velocityFor(steady(4));
    expect(velocity.daily).toBe(4);
    expect(velocity.sigma).toBeCloseTo(0, 9);
  });

  it("ignores days outside the window", () => {
    const velocity = velocityFor([
      { sku: "APP-1000", daysAgo: 3, units: 5, revenue: 150 },
      { sku: "APP-1000", daysAgo: 60, units: 500, revenue: 15000 },
    ]);
    expect(velocity.units).toBe(5);
  });

  it("handles an empty history without dividing by zero", () => {
    const velocity = velocityFor([]);
    expect(velocity.daily).toBe(0);
    expect(velocity.sigma).toBe(0);
  });
});

describe("available", () => {
  it("subtracts committed units and never goes negative", () => {
    expect(available(product({ onHand: 100, committed: 30 }))).toBe(70);
    expect(available(product({ onHand: 10, committed: 40 }))).toBe(0);
  });
});

describe("daysOfCover", () => {
  it("divides available stock by daily velocity", () => {
    expect(daysOfCover(product({ onHand: 80 }), velocityFor(steady(4)))).toBe(20);
  });

  it("reports infinite cover for stock with no demand, and zero for neither", () => {
    expect(daysOfCover(product({ onHand: 40 }), velocityFor([]))).toBe(Infinity);
    expect(daysOfCover(product({ onHand: 0 }), velocityFor([]))).toBe(0);
  });
});

describe("safety stock and reorder point", () => {
  it("scales safety stock with the square root of lead time, not linearly", () => {
    // Variance adds over independent days, so sigma grows with sqrt(L). Doing
    // this linearly is the classic spreadsheet error and badly overstates
    // safety stock on long-lead items.
    const velocity = { daily: 5, sigma: 2, units: 140, sellingDays: 28 };

    const nine = safetyStock(velocity, 9);
    const thirtySix = safetyStock(velocity, 36);

    expect(nine).toBeCloseTo(SERVICE_Z * 2 * 3, 6);
    expect(thirtySix).toBeCloseTo(nine * 2, 6);
  });

  it("puts the reorder point at lead-time demand plus safety stock", () => {
    const velocity = { daily: 5, sigma: 2, units: 140, sellingDays: 28 };
    expect(reorderPoint(velocity, 16)).toBeCloseTo(5 * 16 + SERVICE_Z * 2 * 4, 6);
  });

  it("treats a negative lead time as zero rather than producing NaN", () => {
    const velocity = { daily: 5, sigma: 2, units: 140, sellingDays: 28 };
    expect(safetyStock(velocity, -10)).toBe(0);
    expect(reorderPoint(velocity, -10)).toBe(0);
  });
});

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
    expect(normalCdf(1.645)).toBeCloseTo(0.95, 3);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it("is symmetric about zero", () => {
    for (const z of [0.3, 1.1, 2.4]) {
      expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 6);
    }
  });
});

describe("stockoutRisk", () => {
  it("is certain when nothing is available and demand exists", () => {
    expect(stockoutRisk(product({ onHand: 0 }), velocityFor(steady(4)), 14)).toBe(1);
  });

  it("is zero when there is no demand at all", () => {
    expect(stockoutRisk(product({ onHand: 0 }), velocityFor([]), 14)).toBe(0);
  });

  it("sits near a half when supply exactly equals expected lead-time demand", () => {
    const sales: SalesDay[] = Array.from({ length: 28 }, (_, daysAgo) => ({
      sku: "APP-1000",
      daysAgo,
      units: daysAgo % 2 === 0 ? 5 : 3,
      revenue: 120,
    }));
    const velocity = velocityFor(sales);

    const supply = Math.round(velocity.daily * 14);
    const risk = stockoutRisk(product({ onHand: supply }), velocity, 14);

    expect(risk).toBeGreaterThan(0.35);
    expect(risk).toBeLessThan(0.65);
  });

  it("falls as stock rises and rises as lead time lengthens", () => {
    const velocity = velocityFor(
      Array.from({ length: 28 }, (_, daysAgo) => ({
        sku: "APP-1000",
        daysAgo,
        units: daysAgo % 3 === 0 ? 8 : 4,
        revenue: 150,
      })),
    );

    const low = stockoutRisk(product({ onHand: 40 }), velocity, 14);
    const high = stockoutRisk(product({ onHand: 400 }), velocity, 14);
    expect(high).toBeLessThan(low);

    const short = stockoutRisk(product({ onHand: 120 }), velocity, 7);
    const long = stockoutRisk(product({ onHand: 120 }), velocity, 45);
    expect(long).toBeGreaterThan(short);
  });

  it("counts units already on order as supply", () => {
    const velocity = velocityFor(steady(5));
    const without = stockoutRisk(product({ onHand: 30, onOrder: 0 }), velocity, 14);
    const with_ = stockoutRisk(product({ onHand: 30, onOrder: 200 }), velocity, 14);
    expect(with_).toBeLessThanOrEqual(without);
  });
});

describe("assess", () => {
  it("classifies a stocked-out seller", () => {
    const view = assess(product({ onHand: 0 }), steady(6), 14, 50, 12);
    expect(view.state).toBe("stockout");
  });

  it("classifies stock with no demand as dormant, not healthy", () => {
    const view = assess(product({ onHand: 300 }), [], 14, 50, 12);
    expect(view.state).toBe("dormant");
  });

  it("classifies deep cover as overstock", () => {
    const view = assess(product({ onHand: 6000 }), steady(4), 14, 50, 12);
    expect(view.state).toBe("overstock");
    expect(view.daysOfCover).toBeGreaterThan(120);
  });

  it("orders at least the vendor minimum when it orders at all", () => {
    const view = assess(product({ onHand: 1 }), steady(6), 21, 250, 12);
    expect(view.suggestedOrder).toBeGreaterThanOrEqual(250);
  });

  it("suggests nothing when the position is already above target", () => {
    const view = assess(product({ onHand: 5000 }), steady(2), 10, 50, 12);
    expect(view.suggestedOrder).toBe(0);
  });

  it("orders past the reorder point, so it does not immediately trip again", () => {
    // Ordering exactly to the reorder point puts the SKU straight back into
    // reorder territory the day the shipment lands.
    const view = assess(product({ onHand: 0, onOrder: 0 }), steady(5), 20, 1, 12);
    expect(view.suggestedOrder).toBeGreaterThan(view.reorderPoint);
  });

  it("scales margin at risk with both risk and margin", () => {
    const cheap = assess(product({ onHand: 5 }), steady(6), 20, 10, 2);
    const rich = assess(product({ onHand: 5 }), steady(6), 20, 10, 20);
    expect(rich.marginAtRisk).toBeGreaterThan(cheap.marginAtRisk);
  });
});

describe("order quantity is reproducible from what the panel shows", () => {
  it("exposes the order-up-to level that sits between reorder point and quantity", () => {
    // The drawer previously showed the reorder point and the final quantity but
    // not the step between them, so the number could not be reproduced.
    const view = assess(product({ onHand: 955, committed: 0 }), steady(37), 45, 200, 12);

    expect(view.orderUpTo).toBeCloseTo(view.reorderPoint + view.leadTimeDemand, 6);
    expect(view.leadTimeDemand).toBeCloseTo(view.velocity.daily * 45, 6);
  });

  it("reproduces the suggested quantity from the exposed intermediates", () => {
    const item = product({ onHand: 955, committed: 0, onOrder: 0 });
    const view = assess(item, steady(37), 45, 200, 12);

    const rebuilt = Math.max(
      200,
      Math.ceil(view.orderUpTo - view.available - item.onOrder),
    );
    expect(rebuilt).toBe(view.suggestedOrder);
  });

  it("flags when the vendor minimum, not the shortfall, set the quantity", () => {
    const small = assess(product({ onHand: 10 }), steady(1), 7, 500, 5);
    expect(small.suggestedOrder).toBe(500);
    expect(small.moqBound).toBe(true);

    const large = assess(product({ onHand: 0 }), steady(40), 45, 50, 5);
    expect(large.moqBound).toBe(false);
  });
});
