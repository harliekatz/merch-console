/**
 * Unit economics and promotion arithmetic.
 *
 * The number that matters is contribution margin per unit, not gross margin on
 * the product record. A SKU at 42% "margin" that carries a $6 fulfillment cost
 * and a 12% marketplace fee is a different business from one at 42% that ships
 * in an envelope, and a console that reports only the first number will keep
 * recommending promotions on the wrong products.
 */
import type { Channel, Product } from "./types";

/** Percentage-of-revenue fees by channel. Payment processing sits inside these. */
export const CHANNEL_FEES: Record<Channel, number> = {
  web: 0.029,
  wholesale: 0.01,
  marketplace: 0.15,
};

export interface UnitEconomics {
  price: number;
  unitCost: number;
  fulfilmentCost: number;
  /** Dollar value of channel fees at the current price. */
  fees: number;
  /** Price less cost, fulfillment and fees. */
  contribution: number;
  /** Contribution as a share of price. */
  marginRate: number;
  /** Cost change since the prior cost snapshot, as a fraction. */
  costDrift: number;
}

/**
 * The worst fee the product is exposed to, not an average.
 *
 * A SKU listed on both the web and a marketplace can have any given unit sell
 * through either. Averaging the fee would report a margin the product only
 * achieves on a favorable channel mix, which is the optimistic assumption to
 * make in exactly the place it does the most damage.
 */
export function feeRateFor(channels: Channel[]): number {
  if (channels.length === 0) return CHANNEL_FEES.web;
  return Math.max(...channels.map((channel) => CHANNEL_FEES[channel]));
}

export function economics(product: Product, priceOverride?: number): UnitEconomics {
  const price = priceOverride ?? product.price;
  const feeRate = feeRateFor(product.channels);
  const fees = price * feeRate;
  const contribution = price - product.unitCost - product.fulfilmentCost - fees;

  return {
    price,
    unitCost: product.unitCost,
    fulfilmentCost: product.fulfilmentCost,
    fees,
    contribution,
    marginRate: price === 0 ? 0 : contribution / price,
    costDrift:
      product.priorUnitCost === 0
        ? 0
        : (product.unitCost - product.priorUnitCost) / product.priorUnitCost,
  };
}

/** The price at which contribution reaches zero. Below this, volume hurts. */
export function breakevenPrice(product: Product): number {
  const feeRate = feeRateFor(product.channels);
  // p - cost - fulfillment - p·fee = 0  →  p = (cost + fulfillment) / (1 - fee)
  return (product.unitCost + product.fulfilmentCost) / (1 - feeRate);
}

export interface PromoMath {
  /** Price after the discount. */
  promoPrice: number;
  /** Discount as a fraction of list. */
  discountRate: number;
  baseContribution: number;
  promoContribution: number;
  /**
   * Units the promotion must add, as a fraction, just to hold contribution
   * flat. Infinite when the promoted price contributes nothing.
   */
  breakevenLift: number;
  /** True when the discounted price sells below cost plus fees. */
  belowCost: boolean;
}

/**
 * What a discount has to earn back.
 *
 * Required lift = CM₀ / CM₁ − 1. It is the single most useful calculation in
 * promotional merchandising and it is almost never on the screen where the
 * discount is chosen. On a 45% contribution margin, a 20% discount needs about
 * 80% more units to break even, which is a very different conversation from
 * "20% off sounds reasonable".
 */
export function promoMath(
  product: Product,
  kind: "percent" | "amount",
  value: number,
): PromoMath {
  const base = economics(product);
  const promoPrice =
    kind === "percent"
      ? product.price * (1 - value)
      : Math.max(0, product.price - value);

  const promo = economics(product, promoPrice);
  const discountRate = product.price === 0 ? 0 : 1 - promoPrice / product.price;

  return {
    promoPrice,
    discountRate,
    baseContribution: base.contribution,
    promoContribution: promo.contribution,
    breakevenLift:
      promo.contribution <= 0
        ? Number.POSITIVE_INFINITY
        : base.contribution / promo.contribution - 1,
    belowCost: promo.contribution <= 0,
  };
}

/** Contribution dollars from a run of sales at a given price. */
export function contributionFrom(
  product: Product,
  units: number,
  realisedPrice: number,
): number {
  return economics(product, realisedPrice).contribution * units;
}
