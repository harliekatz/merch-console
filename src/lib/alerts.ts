/**
 * The alert engine.
 *
 * Eight rules over the joined rows. Each one states the numbers that made it
 * fire and what to do about it, because an alert a merchandiser has to go and
 * investigate before they can act on it is a task, not an alert.
 *
 * Ranking is by severity first, then by dollars at stake. A stockout on a SKU
 * doing $40 a month and one doing $4,000 are not the same alert, and sorting by
 * rule type alone would bury the second behind a page of the first.
 */
import { OVERSTOCK_DAYS } from "./inventory";
import { probabilityValue } from "./format";
import { breakevenPrice, promoMath } from "./margin";
import type { VendorHealth } from "./vendors";
import type { Alert, Promotion, Severity } from "./types";
import type { Row } from "./select";

const SEVERITY_RANK: Record<Severity, number> = { urgent: 0, warning: 1, info: 2 };

export interface AlertInputs {
  rows: Row[];
  vendorHealth: VendorHealth[];
  promotions: Promotion[];
  /** Realised units per SKU while a promotion was running. */
  promoUnits: Map<string, { promo: number; base: number }>;
}

export function buildAlerts(inputs: AlertInputs): Alert[] {
  const alerts: Alert[] = [];

  for (const row of inputs.rows) {
    const { product, inventory, economics: unit } = row;

    // 1. Out of stock on something that sells.
    if (inventory.state === "stockout") {
      alerts.push({
        id: `stockout-${product.sku}`,
        severity: "urgent",
        kind: "stockout",
        sku: product.sku,
        title: `${product.name} is out of stock`,
        detail: `Selling ${inventory.velocity.daily.toFixed(1)} units a day with ${product.onOrder} on order. ${row.vendor.name} quotes ${row.vendor.quotedLeadDays} days.`,
        action:
          product.onOrder > 0
            ? `Replenishment already placed. Consider pausing the listing until it lands.`
            : `Raise a purchase order for ${Math.max(row.vendor.moq, Math.ceil(inventory.velocity.daily * row.vendor.quotedLeadDays * 1.5))} units.`,
        atStake: row.revenue28,
      });
    }

    // 2. Will run out before a replacement can arrive.
    else if (inventory.state === "at-risk") {
      alerts.push({
        id: `risk-${product.sku}`,
        severity: inventory.stockoutRisk >= 0.7 ? "urgent" : "warning",
        kind: "stockout-risk",
        sku: product.sku,
        title: `${product.name} runs out before restock`,
        detail: `${probabilityValue(inventory.stockoutRisk)}% chance of running out inside the ${row.vendor.quotedLeadDays} day lead time. ${inventory.available} available, ${inventory.daysOfCover.toFixed(0)} days of cover, reorder point ${Math.ceil(inventory.reorderPoint)}.`,
        action: `Order ${inventory.suggestedOrder} units from ${row.vendor.name}.`,
        atStake: inventory.marginAtRisk,
      });
    }

    // 3. Priced at or below the point where a sale contributes nothing.
    if (unit.contribution <= 0 && product.status === "live") {
      alerts.push({
        id: `below-cost-${product.sku}`,
        severity: "urgent",
        kind: "below-cost",
        sku: product.sku,
        title: `${product.name} sells below cost`,
        detail: `At $${product.price.toFixed(2)}, contribution is $${unit.contribution.toFixed(2)} after $${product.unitCost.toFixed(2)} cost, $${product.fulfilmentCost.toFixed(2)} fulfillment and $${unit.fees.toFixed(2)} fees. Every unit sold loses money.`,
        action: `Break-even price is $${breakevenPrice(product).toFixed(2)}. Reprice or delist.`,
        // Volume makes this worse, not better, so the loss scales with units.
        atStake: Math.abs(unit.contribution) * row.units28,
      });
    }

    // 4. Landed cost moved and the price did not follow.
    else if (unit.costDrift > 0.08 && product.status === "live") {
      alerts.push({
        id: `cost-drift-${product.sku}`,
        severity: "warning",
        kind: "margin-erosion",
        sku: product.sku,
        vendorId: product.vendorId,
        title: `${product.name} margin eroding`,
        detail: `Landed cost up ${(unit.costDrift * 100).toFixed(1)}% over 12 weeks with no price change. Margin now ${(unit.marginRate * 100).toFixed(1)}%, against a ${(row.category.targetMargin * 100).toFixed(0)}% category target.`,
        action: `Reprice, renegotiate with ${row.vendor.name}, or accept the lower margin deliberately.`,
        atStake: (product.unitCost - product.priorUnitCost) * row.units28,
      });
    }

    // 5. Capital sitting in stock that is not moving.
    if (inventory.state === "overstock" || inventory.state === "dormant") {
      const value = product.onHand * product.unitCost;
      // A threshold keeps the list actionable. Twenty dollars of dead stock on a
      // tail SKU is true and not worth anyone's morning.
      if (value > 400) {
        alerts.push({
          id: `overstock-${product.sku}`,
          severity: "info",
          kind: "overstock",
          sku: product.sku,
          title: `${product.name} is overstocked`,
          detail:
            inventory.state === "dormant"
              ? `${product.onHand} units on hand with no sales in 28 days. $${value.toFixed(0)} of capital held.`
              : `${inventory.daysOfCover.toFixed(0)} days of cover, against a ${OVERSTOCK_DAYS}-day threshold. $${value.toFixed(0)} of capital held.`,
          action: `Markdown, bundle, or move to clearance. Contribution headroom is $${unit.contribution.toFixed(2)} a unit.`,
          atStake: value,
        });
      }
    }

    // 6. Catalog hygiene. Unglamorous and it costs real conversion.
    if (product.status === "live" && (!product.hasImage || !product.hasDescription)) {
      const missing = [
        !product.hasImage ? "image" : null,
        !product.hasDescription ? "description" : null,
      ].filter(Boolean);

      alerts.push({
        id: `hygiene-${product.sku}`,
        severity: "info",
        kind: "hygiene",
        sku: product.sku,
        title: `${product.name} is missing ${missing.join(" and ")}`,
        detail: `Live on ${product.channels.join(", ")} with an incomplete record.`,
        action: `Add the missing ${missing.join(" and ")} before the next channel sync.`,
        atStake: row.revenue28 * 0.15,
      });
    }
  }

  // 7. Promotions that are not earning back what they gave away.
  for (const promotion of inputs.promotions) {
    if (promotion.status === "ended") continue;

    for (const sku of promotion.skus) {
      const row = inputs.rows.find((candidate) => candidate.product.sku === sku);
      if (!row) continue;

      const math = promoMath(row.product, promotion.kind, promotion.value);
      const observed = inputs.promoUnits.get(sku);

      if (math.belowCost) {
        alerts.push({
          id: `promo-below-cost-${promotion.id}-${sku}`,
          severity: "urgent",
          kind: "promo-below-cost",
          sku,
          promotionId: promotion.id,
          title: `"${promotion.name}" prices ${row.product.name} below cost`,
          detail: `Discounted to $${math.promoPrice.toFixed(2)}, contribution is $${math.promoContribution.toFixed(2)} a unit. No amount of volume recovers this.`,
          action: `Remove this SKU from the promotion or cap the discount at ${Math.max(0, Math.floor((1 - breakevenPrice(row.product) / row.product.price) * 100))}%.`,
          atStake: Math.abs(math.promoContribution) * (observed?.promo ?? 0),
        });
        continue;
      }

      if (observed && observed.base > 0 && math.breakevenLift < Number.POSITIVE_INFINITY) {
        const actualLift = observed.promo / observed.base - 1;
        if (actualLift < math.breakevenLift) {
          alerts.push({
            id: `promo-underperforming-${promotion.id}-${sku}`,
            severity: "warning",
            kind: "promo-underperforming",
            sku,
            promotionId: promotion.id,
            title: `"${promotion.name}" is not paying for itself on ${row.product.name}`,
            detail: `${(math.discountRate * 100).toFixed(0)}% off needs ${(math.breakevenLift * 100).toFixed(0)}% more units to hold contribution flat. Observed lift is ${(actualLift * 100).toFixed(0)}%.`,
            action: `Cut the discount, narrow the SKU list, or end it early.`,
            atStake:
              (math.baseContribution - math.promoContribution) * (observed.promo ?? 0),
          });
        }
      }
    }
  }

  // 8. Vendors whose measured performance is dragging.
  for (const health of inputs.vendorHealth) {
    if (health.score >= 55 || health.receiptCount < 4) continue;

    const worst = [...health.components].sort((a, b) => a.score - b.score)[0];
    alerts.push({
      id: `vendor-${health.vendor.id}`,
      severity: health.score < 45 ? "urgent" : "warning",
      kind: "vendor-health",
      vendorId: health.vendor.id,
      title: `${health.vendor.name} health is ${health.score.toFixed(0)}`,
      detail: `Weakest component is ${worst?.label.toLowerCase()} at ${worst?.score.toFixed(0)}. Actual lead time averages ${health.actualLeadDays.toFixed(0)} days against ${health.vendor.quotedLeadDays} quoted, with ${health.leadVariance.toFixed(0)} days of variance.`,
      action: `Review terms across ${health.skuCount} SKUs, or dual-source the top sellers.`,
      atStake: health.contribution,
    });
  }

  return alerts.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.atStake - a.atStake ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Units sold on promotion against units sold off it, per SKU.
 *
 * Comparing promoted days to the SKU's own non-promoted days is a within-SKU
 * control. It is not a clean counterfactual — seasonality and the reason the
 * promotion was scheduled both leak in — and the README says so. It is still far
 * better than comparing promoted SKUs to unpromoted ones, which mostly measures
 * which products got chosen for the promotion.
 */
export function promoUnits(
  rows: Row[],
  promotions: Promotion[],
  salesBySku: Map<string, { daysAgo: number; units: number }[]>,
): Map<string, { promo: number; base: number }> {
  const windows = new Map<string, { start: number; end: number }[]>();
  for (const promotion of promotions) {
    for (const sku of promotion.skus) {
      const list = windows.get(sku) ?? [];
      list.push({ start: promotion.startsDaysAgo, end: promotion.endsDaysAgo });
      windows.set(sku, list);
    }
  }

  const out = new Map<string, { promo: number; base: number }>();

  for (const row of rows) {
    const sku = row.product.sku;
    const spans = windows.get(sku);
    if (!spans) continue;

    const sales = salesBySku.get(sku) ?? [];
    let promoUnitTotal = 0;
    let promoDays = 0;
    let baseUnitTotal = 0;
    let baseDays = 0;

    for (let daysAgo = 0; daysAgo < 90; daysAgo += 1) {
      const onPromo = spans.some((span) => daysAgo <= span.start && daysAgo >= span.end);
      const units = sales
        .filter((day) => day.daysAgo === daysAgo)
        .reduce((total, day) => total + day.units, 0);

      if (onPromo) {
        promoUnitTotal += units;
        promoDays += 1;
      } else {
        baseUnitTotal += units;
        baseDays += 1;
      }
    }

    // Compared as daily rates, not totals: a 7-day promotion against 83 base
    // days would otherwise always look like a failure.
    out.set(sku, {
      promo: promoDays === 0 ? 0 : promoUnitTotal / promoDays,
      base: baseDays === 0 ? 0 : baseUnitTotal / baseDays,
    });
  }

  return out;
}
