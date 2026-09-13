/** Display helpers. Locale pinned so figures are stable across environments. */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MONEY_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT = new Intl.NumberFormat("en-US");

export function money(value: number): string {
  return MONEY.format(Number.isFinite(value) ? value : 0);
}

export function moneyCents(value: number): string {
  return MONEY_CENTS.format(Number.isFinite(value) ? value : 0);
}

export function count(value: number): string {
  return COUNT.format(Number.isFinite(value) ? Math.round(value) : 0);
}

export function percent(fraction: number, digits = 0): string {
  const value = Number.isFinite(fraction) ? fraction * 100 : 0;
  return `${value.toFixed(digits)}%`;
}

/**
 * Formats a modeled probability without claiming certainty.
 *
 * Rounding to whole percent turned 0.9997 into "100%" and 0.0001 into "0%", so
 * the display asserted that a stockout was certain, or impossible, when the
 * model said neither. Values in the top and bottom half-percent are shown as
 * bounds instead. Everything between rounds normally.
 */
export function probability(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  const value = Math.min(1, Math.max(0, fraction)) * 100;
  if (value >= 99.5) return ">99%";
  if (value > 0 && value < 0.5) return "<1%";
  return `${value.toFixed(0)}%`;
}

/** The same bounds as `probability`, for CSV columns and alert text. */
export function probabilityValue(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0";
  const value = Math.min(1, Math.max(0, fraction)) * 100;
  if (value >= 99.5) return ">99";
  if (value > 0 && value < 0.5) return "<1";
  return value.toFixed(0);
}

export function signedPercent(fraction: number, digits = 1): string {
  const value = Number.isFinite(fraction) ? fraction * 100 : 0;
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/** Cover is often infinite for a dormant SKU; the table should say so. */
export function days(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 999) return "999+";
  return `${Math.round(value)}d`;
}

export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
