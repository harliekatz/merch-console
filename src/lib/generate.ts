/**
 * The synthetic dataset.
 *
 * None of this is employer data. It is generated from a fixed seed to look like
 * a mid-size print-on-demand and apparel catalog, because that is the shape of
 * problem the console is built for.
 *
 * The generation is not uniform noise. Real catalogs are lopsided, and a console
 * built against flat data looks fine and then falls over the moment it meets a
 * long tail. So this deliberately produces:
 *
 *   - a Pareto-ish revenue distribution, where a fifth of SKUs carry most sales
 *   - weekday and seasonal demand shape, so velocity variance is not artificial
 *   - a handful of genuinely broken records: below-cost pricing, cost spikes
 *     with no price move, dead stock, missing images
 *   - one vendor that is quietly failing on lead time, and one on quality
 *
 * Those cases exist so the alert engine has something true to find. They are
 * planted deliberately, not hoped for.
 */
import { between, gaussian, intBetween, mulberry32, pick, poisson } from "./rng";
import { CHANNEL_FEES } from "./margin";
import type {
  Category,
  Channel,
  Dataset,
  Product,
  Promotion,
  Receipt,
  SalesDay,
  Vendor,
} from "./types";

export const SEED = 4_071_926;
export const HISTORY_DAYS = 90;
export const REFERENCE_DATE = "2026-09-01";
export const SKU_COUNT = 240;

const CATEGORIES: Category[] = [
  { id: "apparel", name: "Apparel", targetMargin: 0.52 },
  { id: "drinkware", name: "Drinkware", targetMargin: 0.46 },
  { id: "bags", name: "Bags", targetMargin: 0.44 },
  { id: "office", name: "Office", targetMargin: 0.38 },
  { id: "tech", name: "Tech accessories", targetMargin: 0.34 },
  { id: "home", name: "Home", targetMargin: 0.41 },
];

const VENDOR_SEEDS: Omit<Vendor, "id" | "onboardedAt">[] = [
  { name: "Northgate Textiles", country: "Portugal", quotedLeadDays: 21, moq: 50, termsDays: 30 },
  { name: "Harbor Print Co", country: "United States", quotedLeadDays: 10, moq: 25, termsDays: 15 },
  { name: "Vellum Supply", country: "United States", quotedLeadDays: 14, moq: 40, termsDays: 30 },
  { name: "Kestrel Goods", country: "Vietnam", quotedLeadDays: 45, moq: 200, termsDays: 60 },
  { name: "Alder & Co", country: "United Kingdom", quotedLeadDays: 18, moq: 30, termsDays: 30 },
  { name: "Sunset Ceramics", country: "Mexico", quotedLeadDays: 28, moq: 100, termsDays: 45 },
  { name: "Pinegrove Mills", country: "Canada", quotedLeadDays: 16, moq: 60, termsDays: 30 },
  { name: "Lantern Works", country: "Poland", quotedLeadDays: 24, moq: 80, termsDays: 45 },
  { name: "Copperline Tools", country: "Taiwan", quotedLeadDays: 38, moq: 150, termsDays: 60 },
  { name: "Marlowe Paper", country: "United States", quotedLeadDays: 8, moq: 20, termsDays: 15 },
];

/**
 * Vendors with planted problems.
 *
 * Named here rather than left to chance so the alert engine has a deterministic
 * target and a test can assert the console surfaces them.
 */
const TROUBLED = {
  /** Chronically late and erratic. */
  lateVendor: 3,
  /** High rejection rate on inspection. */
  qualityVendor: 8,
  /** Pushing landed costs up without a price response. */
  costVendor: 5,
} as const;

const ADJECTIVES = [
  "Everyday", "Heritage", "Alpine", "Coastal", "Studio", "Field", "Weekend",
  "Summit", "Harbor", "Meadow", "Trail", "Canyon", "Orchard", "Foundry",
  "Riverbend", "Northside", "Pioneer", "Lantern", "Copper", "Linden",
];

const NOUNS: Record<string, string[]> = {
  apparel: ["Tee", "Hoodie", "Crewneck", "Long Sleeve", "Cap", "Beanie", "Zip Jacket", "Polo"],
  drinkware: ["Tumbler", "Mug", "Bottle", "Travel Cup", "Pint Glass", "Flask", "Carafe"],
  bags: ["Tote", "Backpack", "Duffel", "Sling", "Pouch", "Messenger Bag", "Packing Cube"],
  office: ["Notebook", "Planner", "Pen Set", "Desk Mat", "Folder", "Sticky Set", "Binder"],
  tech: ["Mouse Pad", "Cable Kit", "Phone Stand", "Laptop Sleeve", "Charger", "Earbud Case"],
  home: ["Candle", "Throw", "Coaster Set", "Cutting Board", "Apron", "Tea Towel", "Frame"],
};

const CATEGORY_PREFIX: Record<string, string> = {
  apparel: "APP",
  drinkware: "DRK",
  bags: "BAG",
  office: "OFF",
  tech: "TEC",
  home: "HOM",
};

export function generate(seed = SEED): Dataset {
  const next = mulberry32(seed);
  const reference = new Date(`${REFERENCE_DATE}T00:00:00Z`);

  const vendors: Vendor[] = VENDOR_SEEDS.map((vendor, index) => ({
    ...vendor,
    id: `v-${String(index + 1).padStart(2, "0")}`,
    onboardedAt: isoDaysBefore(reference, intBetween(next, 200, 1400)),
  }));

  const products: Product[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < SKU_COUNT; i += 1) {
    const category = pick(CATEGORIES, next);
    const vendorIndex = Math.floor(next() * vendors.length);
    const vendor = vendors[vendorIndex] as Vendor;

    let name = `${pick(ADJECTIVES, next)} ${pick(NOUNS[category.id] ?? ["Item"], next)}`;
    let attempt = 2;
    while (usedNames.has(name)) {
      name = `${pick(ADJECTIVES, next)} ${pick(NOUNS[category.id] ?? ["Item"], next)} ${attempt}`;
      attempt += 1;
    }
    usedNames.add(name);

    const price = between(next, 9, 96);

    const channels: Channel[] = ["web"];
    if (next() < 0.45) channels.push("marketplace");
    if (next() < 0.3) channels.push("wholesale");

    // Fulfillment scales with price rather than being flat. Bigger, pricier
    // items cost more to pack and ship, and a flat draw put $6 of shipping on
    // $10 products, which made the cheap half of the catalog look structurally
    // unprofitable when the real problem was the generator.
    const fulfilmentCost = round2(0.75 + price * between(next, 0.04, 0.09, 4));

    // Cost is solved backwards from the contribution margin the category should
    // achieve, net of fees and fulfillment, rather than from gross margin. The
    // console reports contribution everywhere, so generating against gross
    // margin would make every category miss its own target by construction.
    const feeRate = Math.max(...channels.map((channel) => CHANNEL_FEES[channel]));
    const wanted = clamp(category.targetMargin + gaussian(next) * 0.08, 0.05, 0.75);
    const unitCost = round2(
      clamp(price * (1 - feeRate - wanted) - fulfilmentCost, price * 0.12, price * 0.92),
    );

    const roll = next();
    const status: Product["status"] =
      roll < 0.8 ? "live" : roll < 0.88 ? "draft" : roll < 0.96 ? "paused" : "discontinued";

    // Cost drift. The designated cost-problem vendor pushes harder.
    const drift =
      vendorIndex === TROUBLED.costVendor
        ? between(next, 0.08, 0.22, 4)
        : between(next, -0.05, 0.07, 4);

    products.push({
      sku: `${CATEGORY_PREFIX[category.id] ?? "GEN"}-${String(1000 + i)}`,
      name,
      categoryId: category.id,
      vendorId: vendor.id,
      status,
      channels,
      price,
      unitCost,
      priorUnitCost: round2(unitCost / (1 + drift)),
      fulfilmentCost,
      onHand: 0,
      onOrder: 0,
      committed: 0,
      hasImage: next() > 0.07,
      hasDescription: next() > 0.11,
      createdAt: isoDaysBefore(reference, intBetween(next, 30, 900)),
      updatedAt: isoDaysBefore(reference, intBetween(next, 0, 60)),
    });
  }

  // Demand tiers. A fifth of the catalog carries most of the volume, which is
  // what a real assortment looks like and what makes the long tail interesting.
  const baseDemand = new Map<string, number>();
  for (const [index, product] of products.entries()) {
    const rank = index / products.length;
    const tier =
      rank < 0.08 ? between(next, 14, 40) :
      rank < 0.22 ? between(next, 5, 14) :
      rank < 0.55 ? between(next, 1.2, 5) :
      between(next, 0.05, 1.2);

    baseDemand.set(
      product.sku,
      product.status === "live" ? tier : product.status === "paused" ? tier * 0.15 : 0,
    );
  }

  const promotions = buildPromotions(next, products);
  const promoBySku = new Map<string, Promotion>();
  for (const promotion of promotions) {
    for (const sku of promotion.skus) promoBySku.set(sku, promotion);
  }

  const sales: SalesDay[] = [];
  for (const product of products) {
    const base = baseDemand.get(product.sku) ?? 0;
    if (base <= 0) continue;

    const promotion = promoBySku.get(product.sku);

    for (let daysAgo = 0; daysAgo < HISTORY_DAYS; daysAgo += 1) {
      const date = new Date(reference.getTime() - daysAgo * 86_400_000);
      const weekday = date.getUTCDay();

      // Weekend lift, a gentle upward trend toward the present, and a weekly
      // wobble. The trend runs forward rather than peaking mid-window: a sine
      // across the whole history put the peak 45 days back and opened the
      // dashboard on a double-digit decline that was an artefact of the curve.
      const weekend = weekday === 0 || weekday === 6 ? 1.25 : 1;
      const trend = 1 + 0.26 * ((HISTORY_DAYS - daysAgo) / HISTORY_DAYS);
      const wobble = 1 + 0.09 * Math.sin((daysAgo / 7) * 2 * Math.PI);
      const season = trend * wobble;

      const onPromo =
        promotion !== undefined &&
        daysAgo <= promotion.startsDaysAgo &&
        daysAgo >= promotion.endsDaysAgo;

      // Promotions genuinely lift units. Whether the lift covers the margin
      // given up is the question the promotions screen exists to answer, and
      // the generated lift is deliberately not always enough.
      const lift = onPromo ? 1 + between(next, 0.25, 1.6) : 1;

      const lambda = base * weekend * season * lift;
      const units = poisson(next, lambda);
      if (units === 0) continue;

      const realisedPrice = onPromo
        ? promotion.kind === "percent"
          ? product.price * (1 - promotion.value)
          : Math.max(0, product.price - promotion.value)
        : product.price;

      sales.push({
        sku: product.sku,
        daysAgo,
        units,
        revenue: round2(units * realisedPrice),
      });
    }
  }

  // Stock positions, set from realized velocity so cover figures are plausible
  // rather than random. A slice is deliberately pushed into trouble.
  const unitsBySku = new Map<string, number>();
  for (const day of sales) {
    if (day.daysAgo < 28) {
      unitsBySku.set(day.sku, (unitsBySku.get(day.sku) ?? 0) + day.units);
    }
  }

  for (const product of products) {
    const daily = (unitsBySku.get(product.sku) ?? 0) / 28;
    const vendor = vendors.find((candidate) => candidate.id === product.vendorId) as Vendor;
    const roll = next();

    // Overstock lands on slow movers, which is where it lands in reality.
    // Drawing it uniformly put 300 days of cover on the top sellers and made
    // two thirds of the catalog's inventory value read as dead stock.
    const slow = daily < 2;
    const overstockOdds = slow ? 0.3 : 0.06;

    let coverDays: number;
    if (roll < 0.07) coverDays = 0;                                  // stocked out
    else if (roll < 0.2) coverDays = between(next, 1, 12);           // about to run out
    else if (roll < 1 - overstockOdds) coverDays = between(next, 25, 95);
    else coverDays = slow ? between(next, 150, 400) : between(next, 130, 190);

    product.onHand = Math.max(0, Math.round(daily * coverDays));
    product.committed = Math.round(product.onHand * between(next, 0, 0.12));
    product.onOrder =
      next() < 0.3 ? Math.max(vendor.moq, Math.round(daily * vendor.quotedLeadDays)) : 0;

    // A small set of genuinely broken price records, so the below-cost rule has
    // real work to do rather than firing on rounding.
    if (next() < 0.04) {
      product.price = round2((product.unitCost + product.fulfilmentCost) * between(next, 0.82, 1.02));
    }
  }

  const receipts = buildReceipts(next, vendors, reference);

  return {
    referenceDate: REFERENCE_DATE,
    categories: CATEGORIES,
    vendors,
    products,
    sales,
    promotions,
    receipts,
  };
}

function buildPromotions(next: () => number, products: Product[]): Promotion[] {
  const live = products.filter((product) => product.status === "live");
  const names = [
    "Back to Campus", "Autumn Refresh", "Vendor Clearance", "Bundle & Save",
    "Weekend Flash", "New Season Preview", "Overstock Move", "Loyalty Members",
  ];

  return names.map((name, index) => {
    const startsDaysAgo = intBetween(next, 6, 70);
    const length = intBetween(next, 5, 21);
    const endsDaysAgo = startsDaysAgo - length;

    const size = intBetween(next, 4, 14);
    const skus: string[] = [];
    for (let i = 0; i < size && live.length > 0; i += 1) {
      const candidate = pick(live, next);
      if (!skus.includes(candidate.sku)) skus.push(candidate.sku);
    }

    const kind: Promotion["kind"] = next() < 0.7 ? "percent" : "amount";

    return {
      id: `promo-${index + 1}`,
      name,
      kind,
      value: kind === "percent" ? between(next, 0.1, 0.4, 2) : between(next, 3, 15),
      skus,
      startsDaysAgo,
      endsDaysAgo,
      status: endsDaysAgo > 0 ? "ended" : startsDaysAgo < 0 ? "scheduled" : "active",
    };
  });
}

function buildReceipts(
  next: () => number,
  vendors: Vendor[],
  reference: Date,
): Receipt[] {
  const receipts: Receipt[] = [];

  for (const [index, vendor] of vendors.entries()) {
    const count = intBetween(next, 8, 16);

    for (let i = 0; i < count; i += 1) {
      const orderedDaysAgo = intBetween(next, vendor.quotedLeadDays + 5, 330);

      // The designated late vendor runs well past quote with high variance.
      const slip =
        index === TROUBLED.lateVendor
          ? between(next, 0.15, 0.75)
          : between(next, -0.12, 0.18);
      const actualLead = Math.max(1, Math.round(vendor.quotedLeadDays * (1 + slip)));

      const unitsOrdered = vendor.moq * intBetween(next, 1, 6);
      const shortfall = next() < 0.18 ? between(next, 0.02, 0.15) : 0;
      const unitsReceived = Math.round(unitsOrdered * (1 - shortfall));

      const rejectRate =
        index === TROUBLED.qualityVendor
          ? between(next, 0.04, 0.14, 4)
          : between(next, 0, 0.02, 4);

      receipts.push({
        id: `rcpt-${vendor.id}-${i}`,
        vendorId: vendor.id,
        orderedAt: isoDaysBefore(reference, orderedDaysAgo),
        receivedAt: isoDaysBefore(reference, Math.max(0, orderedDaysAgo - actualLead)),
        unitsOrdered,
        unitsReceived,
        unitsRejected: Math.round(unitsReceived * rejectRate),
      });
    }
  }

  return receipts;
}

function isoDaysBefore(reference: Date, days: number): string {
  return new Date(reference.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Generated once at module load. Stable for the life of the page. */
export const DATA: Dataset = generate();
