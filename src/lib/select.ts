/**
 * Derivations over the dataset.
 *
 * This is the "one place" part of the product: every screen reads joined rows
 * from here rather than reaching into the raw entities, so a product row already
 * knows its vendor's lead time, its trailing velocity, its unit economics and
 * whether it is on promotion. The joins are built once and indexed, because the
 * catalog screen filters and sorts over them on every keystroke.
 */
import { assess, type InventoryView } from "./inventory";
import { economics, type UnitEconomics } from "./margin";
import type {
  Category,
  Dataset,
  Product,
  Promotion,
  SalesDay,
  Vendor,
} from "./types";

export interface Row {
  product: Product;
  vendor: Vendor;
  category: Category;
  economics: UnitEconomics;
  inventory: InventoryView;
  /** The active or most recent promotion covering this SKU, if any. */
  promotion: Promotion | null;
  /** Trailing 28-day revenue. */
  revenue28: number;
  /** Trailing 28-day units. */
  units28: number;
  /** Trailing 28-day contribution dollars. */
  contribution28: number;
  /** Revenue in the 28 days before that, for period comparison. */
  revenuePrior28: number;
}

export interface Indexed {
  rows: Row[];
  bySku: Map<string, Row>;
  salesBySku: Map<string, SalesDay[]>;
  revenueBySku: Map<string, number>;
  /** Daily totals, index 0 is the most recent day. */
  dailyRevenue: number[];
  dailyUnits: number[];
}

export function index(data: Dataset): Indexed {
  const salesBySku = new Map<string, SalesDay[]>();
  for (const day of data.sales) {
    const list = salesBySku.get(day.sku);
    if (list) list.push(day);
    else salesBySku.set(day.sku, [day]);
  }

  const vendorsById = new Map(data.vendors.map((vendor) => [vendor.id, vendor]));
  const categoriesById = new Map(data.categories.map((category) => [category.id, category]));

  const promoBySku = new Map<string, Promotion>();
  for (const promotion of data.promotions) {
    for (const sku of promotion.skus) {
      const existing = promoBySku.get(sku);
      // Prefer an active promotion over a finished one when a SKU appears twice.
      if (!existing || rankPromotion(promotion) > rankPromotion(existing)) {
        promoBySku.set(sku, promotion);
      }
    }
  }

  const rows: Row[] = [];
  const revenueBySku = new Map<string, number>();

  for (const product of data.products) {
    const vendor = vendorsById.get(product.vendorId);
    const category = categoriesById.get(product.categoryId);
    if (!vendor || !category) continue;

    const sales = salesBySku.get(product.sku) ?? [];
    const unit = economics(product);

    const recent = sales.filter((day) => day.daysAgo < 28);
    const prior = sales.filter((day) => day.daysAgo >= 28 && day.daysAgo < 56);

    const revenue28 = round2(recent.reduce((total, day) => total + day.revenue, 0));
    const units28 = recent.reduce((total, day) => total + day.units, 0);

    revenueBySku.set(product.sku, revenue28);

    rows.push({
      product,
      vendor,
      category,
      economics: unit,
      inventory: assess(product, sales, vendor.quotedLeadDays, vendor.moq, unit.contribution),
      promotion: promoBySku.get(product.sku) ?? null,
      revenue28,
      units28,
      contribution28: round2(units28 * unit.contribution),
      revenuePrior28: round2(prior.reduce((total, day) => total + day.revenue, 0)),
    });
  }

  const dailyRevenue = new Array<number>(90).fill(0);
  const dailyUnits = new Array<number>(90).fill(0);
  for (const day of data.sales) {
    if (day.daysAgo < 90) {
      dailyRevenue[day.daysAgo] = (dailyRevenue[day.daysAgo] ?? 0) + day.revenue;
      dailyUnits[day.daysAgo] = (dailyUnits[day.daysAgo] ?? 0) + day.units;
    }
  }

  return {
    rows,
    bySku: new Map(rows.map((row) => [row.product.sku, row])),
    salesBySku,
    revenueBySku,
    dailyRevenue,
    dailyUnits,
  };
}

function rankPromotion(promotion: Promotion): number {
  if (promotion.status === "active") return 3;
  if (promotion.status === "scheduled") return 2;
  return 1;
}

export interface Totals {
  revenue28: number;
  revenuePrior28: number;
  revenueChange: number;
  contribution28: number;
  marginRate: number;
  units28: number;
  liveSkus: number;
  inventoryValue: number;
  /** Retail value of stock in overstock or dormant states. */
  deadStockValue: number;
  atRiskSkus: number;
  atRiskRevenue: number;
}

export function totals(rows: Row[]): Totals {
  const revenue28 = sum(rows.map((row) => row.revenue28));
  const revenuePrior28 = sum(rows.map((row) => row.revenuePrior28));
  const contribution28 = sum(rows.map((row) => row.contribution28));

  const atRisk = rows.filter(
    (row) => row.inventory.state === "at-risk" || row.inventory.state === "stockout",
  );

  const dead = rows.filter(
    (row) => row.inventory.state === "overstock" || row.inventory.state === "dormant",
  );

  return {
    revenue28: round2(revenue28),
    revenuePrior28: round2(revenuePrior28),
    revenueChange: revenuePrior28 === 0 ? 0 : (revenue28 - revenuePrior28) / revenuePrior28,
    contribution28: round2(contribution28),
    marginRate: revenue28 === 0 ? 0 : contribution28 / revenue28,
    units28: sum(rows.map((row) => row.units28)),
    liveSkus: rows.filter((row) => row.product.status === "live").length,
    inventoryValue: round2(
      sum(rows.map((row) => row.product.onHand * row.product.unitCost)),
    ),
    deadStockValue: round2(
      sum(dead.map((row) => row.product.onHand * row.product.unitCost)),
    ),
    atRiskSkus: atRisk.length,
    atRiskRevenue: round2(sum(atRisk.map((row) => row.revenue28))),
  };
}

export interface CategorySlice {
  category: Category;
  revenue28: number;
  contribution28: number;
  marginRate: number;
  skus: number;
  share: number;
}

export function byCategory(rows: Row[]): CategorySlice[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const list = groups.get(row.category.id);
    if (list) list.push(row);
    else groups.set(row.category.id, [row]);
  }

  const total = sum(rows.map((row) => row.revenue28)) || 1;

  return [...groups.values()]
    .map((group) => {
      const revenue28 = sum(group.map((row) => row.revenue28));
      const contribution28 = sum(group.map((row) => row.contribution28));
      return {
        category: group[0]!.category,
        revenue28: round2(revenue28),
        contribution28: round2(contribution28),
        marginRate: revenue28 === 0 ? 0 : contribution28 / revenue28,
        skus: group.length,
        share: revenue28 / total,
      };
    })
    .sort((a, b) => b.revenue28 - a.revenue28);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
