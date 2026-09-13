/**
 * The unified model.
 *
 * The whole premise of this console is that product, vendor, inventory, pricing,
 * promotion and sales data sit in one place. That claim is only worth anything
 * if there is an actual schema behind it, so the entities below are joined by id
 * and every derived figure on screen traces back through them.
 *
 * Everything here is synthetic. No employer data, schema or code is reproduced.
 */

export type Channel = "web" | "wholesale" | "marketplace";

export type ProductStatus = "live" | "draft" | "paused" | "discontinued";

export interface Category {
  id: string;
  name: string;
  /** Typical margin for the category, used only to shape generated data. */
  targetMargin: number;
}

export interface Vendor {
  id: string;
  name: string;
  country: string;
  /** Quoted lead time in days. Actual receipts vary around it. */
  quotedLeadDays: number;
  /** Minimum order quantity, per purchase order. */
  moq: number;
  /** Payment terms in days. */
  termsDays: number;
  onboardedAt: string;
}

/** One purchase order receipt. The raw evidence behind vendor scoring. */
export interface Receipt {
  id: string;
  vendorId: string;
  orderedAt: string;
  receivedAt: string;
  unitsOrdered: number;
  unitsReceived: number;
  /** Units rejected on inspection. */
  unitsRejected: number;
}

export interface Product {
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  status: ProductStatus;
  channels: Channel[];

  /** Current list price. */
  price: number;
  /** Landed unit cost from the vendor. */
  unitCost: number;
  /** Unit cost twelve weeks ago, so cost drift is visible. */
  priorUnitCost: number;
  /** Per-unit outbound shipping and handling. */
  fulfilmentCost: number;

  onHand: number;
  /** Units on an open purchase order, not yet received. */
  onOrder: number;
  /** Units committed to orders not yet shipped. */
  committed: number;

  /** Catalog hygiene, the unglamorous half of merchandising ops. */
  hasImage: boolean;
  hasDescription: boolean;

  createdAt: string;
  updatedAt: string;
}

/** One day of sales for one SKU. The fact table. */
export interface SalesDay {
  sku: string;
  /** Days before the reference date. 0 is the most recent day. */
  daysAgo: number;
  units: number;
  /** Realised revenue, net of any promotion discount. */
  revenue: number;
}

export type PromotionKind = "percent" | "amount";

export interface Promotion {
  id: string;
  name: string;
  kind: PromotionKind;
  /** Percent as a fraction (0.2 = 20% off), or dollars off per unit. */
  value: number;
  skus: string[];
  startsDaysAgo: number;
  /** Negative means the promotion has not started yet. */
  endsDaysAgo: number;
  status: "active" | "scheduled" | "ended";
}

/** Everything the app reads. Generated once, deterministically. */
export interface Dataset {
  referenceDate: string;
  categories: Category[];
  vendors: Vendor[];
  products: Product[];
  sales: SalesDay[];
  promotions: Promotion[];
  receipts: Receipt[];
}

/** A change the user made in the session, kept separate from generated data. */
export interface Edit {
  sku: string;
  field: "price" | "status" | "onOrder";
  from: string | number;
  to: string | number;
  at: string;
}

export type Severity = "urgent" | "warning" | "info";

export interface Alert {
  id: string;
  severity: Severity;
  kind: string;
  /** One line, the thing that is wrong. */
  title: string;
  /** Why the rule fired, in numbers. */
  detail: string;
  /** What to do about it. */
  action: string;
  sku?: string;
  vendorId?: string;
  promotionId?: string;
  /** Revenue or margin dollars at stake. Used to rank within a severity. */
  atStake: number;
}
