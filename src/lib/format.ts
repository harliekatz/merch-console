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
