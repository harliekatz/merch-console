/**
 * Inventory risk.
 *
 * The question a merchandiser actually asks is not "what is low" but "what will
 * run out before a replacement arrives, and how much revenue is that worth".
 * Those are different questions, and a low-stock threshold answers neither: a
 * SKU with 40 units and a 90-day lead time is in more trouble than one with 8
 * units that reorders in three days.
 *
 * So the model is the standard continuous-review one:
 *
 *   demand during lead time  μ_LT = v · L
 *   its standard deviation   σ_LT = σ_daily · √L
 *   safety stock             SS   = z · σ_LT
 *   reorder point            ROP  = μ_LT + SS
 *   stockout probability     P(demand during L > available)
 *
 * The √L term is the part people get wrong when they do this in a spreadsheet.
 * Variance adds over independent days, so the standard deviation grows with the
 * square root of lead time, not linearly with it. Getting that wrong overstates
 * safety stock on long-lead items by a wide margin.
 */
import type { Product, SalesDay } from "./types";

/** Service level 95%, the usual default. z is the normal quantile. */
export const SERVICE_LEVEL = 0.95;
export const SERVICE_Z = 1.645;

/** Trailing window used for velocity. Long enough to smooth a slow week. */
export const VELOCITY_WINDOW = 28;

export interface Velocity {
  /** Mean units per day over the window. */
  daily: number;
  /** Standard deviation of daily units. */
  sigma: number;
  /** Total units in the window. */
  units: number;
  /** Days in the window with at least one sale. */
  sellingDays: number;
}

export function velocityFor(
  sales: SalesDay[],
  window = VELOCITY_WINDOW,
): Velocity {
  const recent = sales.filter((day) => day.daysAgo < window);

  // Days with no row are days with no sales, not missing data. Summing only the
  // rows present would overstate velocity for everything slow-moving.
  const byDay = new Array<number>(window).fill(0);
  for (const day of recent) {
    const index = day.daysAgo;
    if (index >= 0 && index < window) byDay[index] = (byDay[index] ?? 0) + day.units;
  }

  const units = byDay.reduce((sum, value) => sum + value, 0);
  const daily = units / window;
  const variance =
    byDay.reduce((sum, value) => sum + (value - daily) ** 2, 0) / Math.max(1, window - 1);

  return {
    daily,
    sigma: Math.sqrt(variance),
    units,
    sellingDays: byDay.filter((value) => value > 0).length,
  };
}

/** Units genuinely sellable now: on hand less what is already promised. */
export function available(product: Product): number {
  return Math.max(0, product.onHand - product.committed);
}

/** How many days the current position lasts at the current rate. */
export function daysOfCover(product: Product, velocity: Velocity): number {
  if (velocity.daily <= 0) {
    // No sales in the window. Infinite cover is technically right and useless
    // on a dashboard, so this reports a sentinel the UI renders as "no demand".
    return available(product) > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return available(product) / velocity.daily;
}

export function safetyStock(velocity: Velocity, leadDays: number): number {
  return SERVICE_Z * velocity.sigma * Math.sqrt(Math.max(0, leadDays));
}

export function reorderPoint(velocity: Velocity, leadDays: number): number {
  return velocity.daily * Math.max(0, leadDays) + safetyStock(velocity, leadDays);
}

/**
 * Normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation.
 *
 * Accurate to about 1.5e-7, which is several orders of magnitude better than the
 * demand model underneath it deserves. Written out rather than pulled from a
 * dependency because it is nine lines and the alternative is a package.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Probability the SKU stocks out before a replenishment lands.
 *
 * Demand during lead time is approximated as normal. That is wrong in the tail
 * for very slow movers, where demand is closer to Poisson — noted in the README
 * as a known simplification rather than hidden.
 */
export function stockoutRisk(
  product: Product,
  velocity: Velocity,
  leadDays: number,
): number {
  const supply = available(product) + product.onOrder;
  if (velocity.daily <= 0) return 0;
  if (supply <= 0) return 1;

  const mean = velocity.daily * leadDays;
  const sigma = velocity.sigma * Math.sqrt(Math.max(1, leadDays));
  if (sigma <= 0) return supply < mean ? 1 : 0;

  return 1 - normalCdf((supply - mean) / sigma);
}

export interface InventoryView {
  product: Product;
  velocity: Velocity;
  leadDays: number;
  available: number;
  daysOfCover: number;
  reorderPoint: number;
  safetyStock: number;
  stockoutRisk: number;
  /** Units to bring the position back to the reorder point plus a cycle. */
  suggestedOrder: number;
  /** 28-day revenue, used to rank what is worth acting on first. */
  revenue28: number;
  /** Gross margin dollars at risk over the lead time. */
  marginAtRisk: number;
  state: "stockout" | "at-risk" | "reorder" | "healthy" | "overstock" | "dormant";
}

/** Cover above this with real demand is capital sitting still. */
export const OVERSTOCK_DAYS = 120;

export function assess(
  product: Product,
  sales: SalesDay[],
  leadDays: number,
  moq: number,
  unitMargin: number,
): InventoryView {
  const velocity = velocityFor(sales);
  const cover = daysOfCover(product, velocity);
  const rop = reorderPoint(velocity, leadDays);
  const risk = stockoutRisk(product, velocity, leadDays);
  const stock = available(product);

  const revenue28 = sales
    .filter((day) => day.daysAgo < VELOCITY_WINDOW)
    .reduce((sum, day) => sum + day.revenue, 0);

  // Order up to the reorder point plus one lead time of demand, then round up
  // to the vendor's minimum. Ordering exactly to the reorder point would put the
  // SKU straight back into reorder territory on arrival.
  const target = rop + velocity.daily * leadDays;
  const gap = Math.max(0, target - (stock + product.onOrder));
  const suggestedOrder = gap <= 0 ? 0 : Math.max(moq, Math.ceil(gap));

  let state: InventoryView["state"];
  if (stock <= 0 && velocity.daily > 0) state = "stockout";
  else if (velocity.daily <= 0) state = stock > 0 ? "dormant" : "healthy";
  else if (risk >= 0.4) state = "at-risk";
  else if (stock + product.onOrder <= rop) state = "reorder";
  else if (cover > OVERSTOCK_DAYS) state = "overstock";
  else state = "healthy";

  return {
    product,
    velocity,
    leadDays,
    available: stock,
    daysOfCover: cover,
    reorderPoint: rop,
    safetyStock: safetyStock(velocity, leadDays),
    stockoutRisk: risk,
    suggestedOrder,
    revenue28,
    marginAtRisk: risk * velocity.daily * leadDays * unitMargin,
    state,
  };
}
