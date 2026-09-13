/**
 * Vendor scoring.
 *
 * A single health number is only defensible if you can open it up, so the score
 * is a weighted sum of five measured components and the console always shows the
 * breakdown next to the total. A vendor arguing about a 62 should be able to see
 * that it is on-time delivery, not quality, and so should the merchandiser
 * deciding whether to move the order.
 *
 * Every component is computed from receipts and product records. None of them is
 * a judgement someone typed in.
 */
import { economics } from "./margin";
import type { Product, Receipt, Vendor } from "./types";

export interface ComponentScore {
  key: string;
  label: string;
  /** 0-100. */
  score: number;
  /** Share of the total. */
  weight: number;
  /** The measured figure behind the score, formatted by the caller. */
  value: number;
  hint: string;
}

export interface VendorHealth {
  vendor: Vendor;
  /** 0-100, weighted sum of the components. */
  score: number;
  grade: "A" | "B" | "C" | "D";
  components: ComponentScore[];
  receiptCount: number;
  skuCount: number;
  /** Mean actual lead time in days, across receipts. */
  actualLeadDays: number;
  /** Standard deviation of actual lead time. */
  leadVariance: number;
  /** Trailing contribution dollars from this vendor's products. */
  contribution: number;
}

const WEIGHTS = {
  fillRate: 0.28,
  onTime: 0.26,
  consistency: 0.18,
  quality: 0.16,
  costTrend: 0.12,
} as const;

export function vendorHealth(
  vendor: Vendor,
  receipts: Receipt[],
  products: Product[],
  revenueBySku: Map<string, number>,
): VendorHealth {
  const mine = receipts.filter((receipt) => receipt.vendorId === vendor.id);
  const myProducts = products.filter((product) => product.vendorId === vendor.id);

  const leadTimes = mine.map(
    (receipt) =>
      (new Date(receipt.receivedAt).getTime() - new Date(receipt.orderedAt).getTime()) /
      86_400_000,
  );

  const actualLeadDays = mean(leadTimes);
  const leadVariance = stdev(leadTimes, actualLeadDays);

  const ordered = sum(mine.map((receipt) => receipt.unitsOrdered));
  const received = sum(mine.map((receipt) => receipt.unitsReceived));
  const rejected = sum(mine.map((receipt) => receipt.unitsRejected));

  // Fill rate: did the units ordered actually arrive.
  const fillRate = ordered === 0 ? 1 : Math.min(1, received / ordered);

  // On time: arrived within the quoted lead time plus two days of grace.
  const onTimeCount = leadTimes.filter(
    (days) => days <= vendor.quotedLeadDays + 2,
  ).length;
  const onTime = mine.length === 0 ? 1 : onTimeCount / mine.length;

  // Consistency: coefficient of variation on lead time, inverted. A vendor that
  // is reliably slow is easier to plan around than one that is erratic, and the
  // safety-stock formula literally consumes this variance.
  const cv = actualLeadDays === 0 ? 0 : leadVariance / actualLeadDays;
  const consistency = clamp01(1 - cv / 0.6);

  // Rejection is scored against a 5% floor, not against 100%. Dividing by 100%
  // made a 12% reject rate score 88, which is a comfortable pass for a vendor
  // sending back one box in eight. Five percent is genuinely unacceptable, so
  // that is where the component hits zero.
  const QUALITY_FLOOR = 0.05;
  const quality = received === 0 ? 1 : clamp01(1 - rejected / received / QUALITY_FLOOR);

  // Cost trend: unweighted mean drift across this vendor's SKUs, inverted so
  // that rising costs lower the score. A 10% increase lands at zero.
  const drifts = myProducts.map((product) => economics(product).costDrift);
  const meanDrift = mean(drifts);
  const costTrend = clamp01(1 - Math.max(0, meanDrift) / 0.1);

  const components: ComponentScore[] = [
    {
      key: "fillRate",
      label: "Fill rate",
      score: fillRate * 100,
      weight: WEIGHTS.fillRate,
      value: fillRate,
      hint: "Units received against units ordered",
    },
    {
      key: "onTime",
      label: "On time",
      score: onTime * 100,
      weight: WEIGHTS.onTime,
      value: onTime,
      hint: `Receipts inside the quoted ${vendor.quotedLeadDays} days, plus 2 days grace`,
    },
    {
      key: "consistency",
      label: "Consistency",
      score: consistency * 100,
      weight: WEIGHTS.consistency,
      value: cv,
      hint: "Lead-time variability. Erratic is worse than slow, because safety stock pays for variance",
    },
    {
      key: "quality",
      label: "Quality",
      score: quality * 100,
      weight: WEIGHTS.quality,
      value: received === 0 ? 0 : rejected / received,
      hint: "Units rejected on inspection",
    },
    {
      key: "costTrend",
      label: "Cost trend",
      score: costTrend * 100,
      weight: WEIGHTS.costTrend,
      value: meanDrift,
      hint: "Mean landed-cost movement across this vendor's SKUs over 12 weeks",
    },
  ];

  const score = components.reduce(
    (total, component) => total + component.score * component.weight,
    0,
  );

  const contribution = myProducts.reduce((total, product) => {
    const revenue = revenueBySku.get(product.sku) ?? 0;
    const unit = economics(product);
    const units = product.price === 0 ? 0 : revenue / product.price;
    return total + units * unit.contribution;
  }, 0);

  return {
    vendor,
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D",
    components,
    receiptCount: mine.length,
    skuCount: myProducts.length,
    actualLeadDays,
    leadVariance,
    contribution,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function stdev(values: number[], average: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(
    sum(values.map((value) => (value - average) ** 2)) / (values.length - 1),
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
