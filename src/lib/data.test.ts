import { describe, expect, it } from "vitest";
import { DATA, HISTORY_DAYS, SEED, SKU_COUNT, generate } from "./generate";
import { index, byCategory, totals } from "./select";
import { buildAlerts, promoUnits } from "./alerts";
import { vendorHealth } from "./vendors";
import { ask, interpret, run } from "./ask";
import { mulberry32, poisson } from "./rng";

const indexed = index(DATA);

describe("rng", () => {
  it("is reproducible for a given seed", () => {
    const a = mulberry32(11);
    const b = mulberry32(11);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("draws non-negative integers from the Poisson sampler", () => {
    const next = mulberry32(5);
    for (let i = 0; i < 3000; i += 1) {
      const value = poisson(next, 3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("has a Poisson mean close to lambda", () => {
    const next = mulberry32(21);
    const samples = Array.from({ length: 20_000 }, () => poisson(next, 6));
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean - 6)).toBeLessThan(0.15);
  });

  it("returns zero for a non-positive lambda", () => {
    expect(poisson(mulberry32(1), 0)).toBe(0);
    expect(poisson(mulberry32(1), -4)).toBe(0);
  });
});

describe("generated dataset", () => {
  it("is identical across runs with the same seed", () => {
    const a = generate(SEED);
    const b = generate(SEED);
    expect(a.products).toEqual(b.products);
    expect(a.sales.length).toBe(b.sales.length);
    expect(a.receipts).toEqual(b.receipts);
  });

  it("differs with a different seed", () => {
    expect(generate(SEED + 1).products[0]?.name).not.toBe(DATA.products[0]?.name);
  });

  it("produces the declared catalog size with unique SKUs", () => {
    expect(DATA.products).toHaveLength(SKU_COUNT);
    expect(new Set(DATA.products.map((product) => product.sku)).size).toBe(SKU_COUNT);
  });

  it("gives every product a real vendor and category", () => {
    const vendors = new Set(DATA.vendors.map((vendor) => vendor.id));
    const categories = new Set(DATA.categories.map((category) => category.id));

    for (const product of DATA.products) {
      expect(vendors.has(product.vendorId)).toBe(true);
      expect(categories.has(product.categoryId)).toBe(true);
    }
  });

  it("keeps every sales row inside the history window and tied to a SKU", () => {
    const skus = new Set(DATA.products.map((product) => product.sku));
    for (const day of DATA.sales) {
      expect(skus.has(day.sku)).toBe(true);
      expect(day.daysAgo).toBeGreaterThanOrEqual(0);
      expect(day.daysAgo).toBeLessThan(HISTORY_DAYS);
      expect(day.units).toBeGreaterThan(0);
    }
  });

  it("never receives a purchase order before it was placed", () => {
    for (const receipt of DATA.receipts) {
      expect(new Date(receipt.receivedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(receipt.orderedAt).getTime(),
      );
      expect(receipt.unitsReceived).toBeLessThanOrEqual(receipt.unitsOrdered);
      expect(receipt.unitsRejected).toBeLessThanOrEqual(receipt.unitsReceived);
    }
  });

  it("has a lopsided revenue distribution, like a real assortment", () => {
    // A flat catalog would make the console look fine and tell you nothing
    // about how it behaves against a long tail.
    const revenues = indexed.rows
      .map((row) => row.revenue28)
      .sort((a, b) => b - a);
    const total = revenues.reduce((sum, value) => sum + value, 0);
    const topFifth = revenues
      .slice(0, Math.ceil(revenues.length * 0.2))
      .reduce((sum, value) => sum + value, 0);

    expect(topFifth / total).toBeGreaterThan(0.5);
  });

  it("contains products in every inventory state the UI can render", () => {
    const states = new Set(indexed.rows.map((row) => row.inventory.state));
    for (const state of ["stockout", "at-risk", "healthy", "overstock"]) {
      expect(states.has(state as never), `missing ${state}`).toBe(true);
    }
  });

  it("plants the problems the alert engine is supposed to find", () => {
    expect(indexed.rows.some((row) => row.economics.contribution <= 0)).toBe(true);
    expect(indexed.rows.some((row) => row.economics.costDrift > 0.08)).toBe(true);
    expect(indexed.rows.some((row) => !row.product.hasImage)).toBe(true);
  });
});

describe("index and totals", () => {
  it("joins every product into a row", () => {
    expect(indexed.rows).toHaveLength(SKU_COUNT);
    expect(indexed.bySku.size).toBe(SKU_COUNT);
  });

  it("keeps category shares summing to one", () => {
    const slices = byCategory(indexed.rows);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 6);
  });

  it("matches total revenue between the row join and the daily series", () => {
    // Two independent paths to the same number. If they disagree, the join
    // dropped rows.
    const fromRows = indexed.rows.reduce((sum, row) => sum + row.revenue28, 0);
    const fromDaily = indexed.dailyRevenue
      .slice(0, 28)
      .reduce((sum, value) => sum + value, 0);
    expect(fromRows).toBeCloseTo(fromDaily, 0);
  });

  it("reports sane headline totals", () => {
    const summary = totals(indexed.rows);
    expect(summary.revenue28).toBeGreaterThan(0);
    expect(summary.marginRate).toBeGreaterThan(0);
    expect(summary.marginRate).toBeLessThan(1);
    expect(summary.liveSkus).toBeGreaterThan(0);
    expect(summary.liveSkus).toBeLessThanOrEqual(SKU_COUNT);
  });
});

describe("vendor health", () => {
  const health = DATA.vendors.map((vendor) =>
    vendorHealth(vendor, DATA.receipts, DATA.products, indexed.revenueBySku),
  );

  it("scores every vendor between 0 and 100", () => {
    for (const entry of health) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
  });

  it("weights the components to exactly one", () => {
    for (const entry of health) {
      const weight = entry.components.reduce((sum, component) => sum + component.weight, 0);
      expect(weight).toBeCloseTo(1, 9);
    }
  });

  it("recomputes the total from the components it shows", () => {
    // The breakdown on screen has to add up to the headline, or the
    // transparency is decorative.
    for (const entry of health) {
      const recomputed = entry.components.reduce(
        (sum, component) => sum + component.score * component.weight,
        0,
      );
      expect(recomputed).toBeCloseTo(entry.score, 9);
    }
  });

  it("finds the vendor planted as chronically late", () => {
    const worstOnTime = [...health].sort(
      (a, b) =>
        (a.components.find((c) => c.key === "onTime")?.score ?? 0) -
        (b.components.find((c) => c.key === "onTime")?.score ?? 0),
    )[0];

    expect(worstOnTime?.actualLeadDays).toBeGreaterThan(
      worstOnTime?.vendor.quotedLeadDays ?? 0,
    );
  });

  it("finds the vendor planted with a quality problem", () => {
    const worstQuality = [...health].sort(
      (a, b) =>
        (a.components.find((c) => c.key === "quality")?.score ?? 0) -
        (b.components.find((c) => c.key === "quality")?.score ?? 0),
    )[0];

    expect(worstQuality?.components.find((c) => c.key === "quality")?.value).toBeGreaterThan(
      0.02,
    );
  });

  it("grades consistently with the score", () => {
    for (const entry of health) {
      if (entry.score >= 85) expect(entry.grade).toBe("A");
      else if (entry.score >= 70) expect(entry.grade).toBe("B");
      else if (entry.score >= 55) expect(entry.grade).toBe("C");
      else expect(entry.grade).toBe("D");
    }
  });
});

describe("alerts", () => {
  const health = DATA.vendors.map((vendor) =>
    vendorHealth(vendor, DATA.receipts, DATA.products, indexed.revenueBySku),
  );
  const units = promoUnits(indexed.rows, DATA.promotions, indexed.salesBySku);
  const alerts = buildAlerts({
    rows: indexed.rows,
    vendorHealth: health,
    promotions: DATA.promotions,
    promoUnits: units,
  });

  it("produces alerts against the generated data", () => {
    expect(alerts.length).toBeGreaterThan(10);
  });

  it("gives every alert a detail and an action", () => {
    // An alert you have to go and investigate before you can act is a task.
    for (const alert of alerts) {
      expect(alert.detail.length).toBeGreaterThan(10);
      expect(alert.action.length).toBeGreaterThan(10);
    }
  });

  it("uses unique ids, so React keys and dismissal are stable", () => {
    expect(new Set(alerts.map((alert) => alert.id)).size).toBe(alerts.length);
  });

  it("sorts urgent first, then by dollars at stake", () => {
    const rank = { urgent: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < alerts.length; i += 1) {
      const previous = alerts[i - 1]!;
      const current = alerts[i]!;
      expect(rank[previous.severity]).toBeLessThanOrEqual(rank[current.severity]);
      if (previous.severity === current.severity) {
        expect(previous.atStake).toBeGreaterThanOrEqual(current.atStake - 1e-9);
      }
    }
  });

  it("raises a below-cost alert for every live loss-making product", () => {
    const loss = indexed.rows.filter(
      (row) => row.economics.contribution <= 0 && row.product.status === "live",
    );
    const raised = alerts.filter((alert) => alert.kind === "below-cost");
    expect(raised).toHaveLength(loss.length);
  });

  it("does not raise stock alerts on discontinued products with no demand", () => {
    const dead = indexed.rows.filter(
      (row) => row.product.status === "discontinued" && row.units28 === 0,
    );
    for (const row of dead) {
      expect(
        alerts.some(
          (alert) => alert.sku === row.product.sku && alert.kind === "stockout",
        ),
      ).toBe(false);
    }
  });

  it("compares promotion lift as a daily rate, not a raw total", () => {
    // A 7-day promotion against 83 base days would always look like a failure
    // if totals were compared.
    for (const value of units.values()) {
      expect(value.promo).toBeLessThan(1000);
      expect(value.base).toBeLessThan(1000);
    }
  });
});

describe("ask", () => {
  it("parses the metric from the question", () => {
    expect(interpret("what should I reorder this week?")?.metric).toBe("stockout-risk");
    expect(interpret("show me overstocked drinkware")?.metric).toBe("overstock");
    expect(interpret("top 10 products by revenue")?.metric).toBe("top-revenue");
    expect(interpret("which products are missing images")?.metric).toBe("hygiene");
  });

  it("picks up a category, a vendor, a percentage and a limit", () => {
    const query = interpret("apparel products with margin below 25%");
    expect(query?.categoryId).toBe("apparel");
    expect(query?.marginBelow).toBeCloseTo(0.25, 6);

    const limited = interpret("top 5 products by revenue");
    expect(limited?.limit).toBe(5);

    const vendor = interpret("slow movers from Kestrel Goods");
    expect(vendor?.vendorId).toBeTruthy();
  });

  it("matches a vendor on its distinctive first word", () => {
    expect(interpret("slow movers from Kestrel")?.vendorId).toBe(
      interpret("slow movers from Kestrel Goods")?.vendorId,
    );
  });

  it("returns null rather than guessing on an unmatched question", () => {
    expect(interpret("what is the weather in san diego")).toBeNull();
    expect(interpret("")).toBeNull();
  });

  it("says so, and offers examples, when nothing matched", () => {
    const answer = ask("please summarize the vibe of the catalog", indexed.rows);
    expect(answer.query).toBeNull();
    expect(answer.rows).toHaveLength(0);
    expect(answer.unmatched?.length).toBeGreaterThan(0);
  });

  it("honours the limit it parsed", () => {
    const answer = ask("top 5 products by revenue", indexed.rows);
    expect(answer.rows).toHaveLength(5);
  });

  it("actually filters by category", () => {
    const answer = ask("show me overstocked drinkware", indexed.rows);
    for (const row of answer.rows) expect(row.category.id).toBe("drinkware");
  });

  it("returns results sorted the way the query says they are", () => {
    const query = interpret("top 20 products by revenue")!;
    const rows = run(query, indexed.rows);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.revenue28).toBeGreaterThanOrEqual(rows[i]!.revenue28);
    }
  });

  it("respects the margin threshold it was given", () => {
    const answer = ask("products with margin below 15%", indexed.rows);
    for (const row of answer.rows) {
      expect(row.economics.marginRate).toBeLessThan(0.15);
    }
  });

  it("summarises every successful query in one line", () => {
    for (const question of [
      "what should I reorder",
      "overstocked products",
      "low margin products",
      "top 10 by revenue",
      "which products had a cost increase",
      "missing images",
      "products on promotion",
      "slow movers",
    ]) {
      const answer = ask(question, indexed.rows);
      expect(answer.query, question).not.toBeNull();
      expect(answer.summary.length).toBeGreaterThan(10);
    }
  });
});
