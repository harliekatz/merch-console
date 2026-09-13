/**
 * The question box.
 *
 * This is deterministic pattern matching over a fixed set of merchandising
 * questions, not a language model. The console says so on the screen, because
 * the alternative — an input that looks like a chat box and quietly fails on
 * anything outside its patterns — trains people to distrust the whole tool.
 *
 * What it does instead of guessing: parses the question into a visible query
 * (metric, filters, sort, limit), shows that query above the results, and says
 * plainly when it could not match. A merchandiser can then see exactly what was
 * run and correct it, which is the same contract a saved report would offer.
 *
 * The honest framing is also the useful one. Every result below is a real query
 * against the joined rows, so the answers are correct by construction rather
 * than correct if the model happened to behave.
 */
import { DATA } from "./generate";
import type { Row } from "./select";

export type Metric =
  | "stockout-risk"
  | "overstock"
  | "low-margin"
  | "top-revenue"
  | "cost-increase"
  | "hygiene"
  | "on-promotion"
  | "slow-moving";

export interface Query {
  metric: Metric;
  /** Human-readable description of what was run. */
  label: string;
  categoryId: string | null;
  vendorId: string | null;
  /** Margin threshold as a fraction, when the question named one. */
  marginBelow: number | null;
  limit: number;
  sortLabel: string;
}

export interface Answer {
  query: Query | null;
  rows: Row[];
  /** One line summarising what was found. */
  summary: string;
  /** Set when nothing matched, listing what can be asked instead. */
  unmatched?: string[];
}

export const EXAMPLES = [
  "What should I reorder this week?",
  "Which apparel products have margin below 30%?",
  "Show me overstocked drinkware",
  "Top 10 products by revenue",
  "Which products had a cost increase?",
  "What is missing images?",
  "Slow movers from Kestrel Goods",
];

const METRIC_PATTERNS: { metric: Metric; label: string; sort: string; test: RegExp }[] = [
  {
    metric: "stockout-risk",
    label: "Products at risk of stocking out",
    sort: "Stockout risk, highest first",
    test: /\b(re-?order\w*|restock\w*|stock ?out\w*|out of stock|running out|replenish\w*|order this week|low stock)\b/,
  },
  {
    metric: "overstock",
    label: "Overstocked and dormant products",
    sort: "Capital held, highest first",
    // Trailing \w* so "overstocked" and "markdowns" match too. A closing \b
    // after a fixed stem only matches the exact word, which is not how people
    // type questions.
    test: /\b(over-?stock\w*|dead ?stock\w*|excess\w*|clearance|markdown\w*|too much stock|sitting)\b/,
  },
  {
    metric: "low-margin",
    label: "Products below the margin threshold",
    sort: "Margin, lowest first",
    test: /\b(margin\w*|profitab\w*|contribution|below cost|unprofitab\w*|thin)\b/,
  },
  {
    metric: "cost-increase",
    label: "Products whose landed cost rose",
    sort: "Cost increase, largest first",
    test: /\b(cost (increase|rise|rose|up|drift)|price increase from|got more expensive|cost went up)\b/,
  },
  {
    metric: "hygiene",
    label: "Live products with incomplete records",
    sort: "Revenue, highest first",
    test: /\b(missing|incomplete|no images?|without images?|no description|hygiene|broken record)\b/,
  },
  {
    metric: "on-promotion",
    label: "Products currently on promotion",
    sort: "Revenue, highest first",
    test: /\b(promotion\w*|promo\w*|discount\w*|on sale|marked down)\b/,
  },
  {
    metric: "slow-moving",
    label: "Slow-moving products",
    sort: "Units sold, lowest first",
    test: /\b(slow\w*|not selling|no sales|stale|dormant|worst sell\w*)\b/,
  },
  {
    metric: "top-revenue",
    label: "Top products by revenue",
    sort: "28-day revenue, highest first",
    test: /\b(top|best|highest|biggest|most revenue|best sell\w*|bestsell\w*)\b/,
  },
];

export function interpret(question: string): Query | null {
  const text = question.toLowerCase().trim();
  if (!text) return null;

  const matched = METRIC_PATTERNS.find((pattern) => pattern.test.test(text));
  if (!matched) return null;

  const category = DATA.categories.find(
    (candidate) =>
      text.includes(candidate.name.toLowerCase()) || text.includes(candidate.id),
  );

  const vendor = DATA.vendors.find((candidate) =>
    // Match on the distinctive first word too, so "Kestrel" finds "Kestrel Goods".
    text.includes(candidate.name.toLowerCase()) ||
    text.includes((candidate.name.split(" ")[0] ?? "").toLowerCase()),
  );

  const percent = /(\d{1,3})\s?(?:%|percent)/.exec(text);
  const limit = /\b(?:top|first|show me)\s+(\d{1,3})\b/.exec(text);

  return {
    metric: matched.metric,
    label: matched.label,
    sortLabel: matched.sort,
    categoryId: category?.id ?? null,
    vendorId: vendor?.id ?? null,
    marginBelow:
      matched.metric === "low-margin" && percent
        ? Number.parseInt(percent[1] ?? "0", 10) / 100
        : matched.metric === "low-margin"
          ? 0.3
          : null,
    limit: limit ? Math.min(100, Math.max(1, Number.parseInt(limit[1] ?? "10", 10))) : 25,
  };
}

export function run(query: Query, rows: Row[]): Row[] {
  let scope = rows;

  if (query.categoryId) {
    scope = scope.filter((row) => row.category.id === query.categoryId);
  }
  if (query.vendorId) {
    scope = scope.filter((row) => row.vendor.id === query.vendorId);
  }

  switch (query.metric) {
    case "stockout-risk":
      return scope
        .filter(
          (row) =>
            row.inventory.state === "at-risk" ||
            row.inventory.state === "stockout" ||
            row.inventory.state === "reorder",
        )
        .sort((a, b) => b.inventory.stockoutRisk - a.inventory.stockoutRisk)
        .slice(0, query.limit);

    case "overstock":
      return scope
        .filter(
          (row) =>
            row.inventory.state === "overstock" || row.inventory.state === "dormant",
        )
        .sort(
          (a, b) =>
            b.product.onHand * b.product.unitCost - a.product.onHand * a.product.unitCost,
        )
        .slice(0, query.limit);

    case "low-margin":
      return scope
        .filter((row) => row.economics.marginRate < (query.marginBelow ?? 0.3))
        .sort((a, b) => a.economics.marginRate - b.economics.marginRate)
        .slice(0, query.limit);

    case "cost-increase":
      return scope
        .filter((row) => row.economics.costDrift > 0.02)
        .sort((a, b) => b.economics.costDrift - a.economics.costDrift)
        .slice(0, query.limit);

    case "hygiene":
      return scope
        .filter(
          (row) =>
            row.product.status === "live" &&
            (!row.product.hasImage || !row.product.hasDescription),
        )
        .sort((a, b) => b.revenue28 - a.revenue28)
        .slice(0, query.limit);

    case "on-promotion":
      return scope
        .filter((row) => row.promotion?.status === "active")
        .sort((a, b) => b.revenue28 - a.revenue28)
        .slice(0, query.limit);

    case "slow-moving":
      return scope
        .filter((row) => row.product.status === "live")
        .sort((a, b) => a.units28 - b.units28 || a.product.sku.localeCompare(b.product.sku))
        .slice(0, query.limit);

    case "top-revenue":
      return scope
        .sort((a, b) => b.revenue28 - a.revenue28)
        .slice(0, query.limit);

    default:
      return [];
  }
}

export function ask(question: string, rows: Row[]): Answer {
  const query = interpret(question);

  if (!query) {
    return {
      query: null,
      rows: [],
      summary: "That question did not match any of the patterns this console knows.",
      unmatched: EXAMPLES,
    };
  }

  const results = run(query, rows);

  return {
    query,
    rows: results,
    summary: summarise(query, results),
  };
}

function summarise(query: Query, rows: Row[]): string {
  if (rows.length === 0) return "No products match that query.";

  const revenue = rows.reduce((total, row) => total + row.revenue28, 0);
  const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

  switch (query.metric) {
    case "stockout-risk": {
      const units = rows.reduce((total, row) => total + row.inventory.suggestedOrder, 0);
      return `${rows.length} products need replenishment, ${units.toLocaleString("en-US")} units in total, covering ${money(revenue)} of trailing 28-day revenue.`;
    }
    case "overstock": {
      const capital = rows.reduce(
        (total, row) => total + row.product.onHand * row.product.unitCost,
        0,
      );
      return `${rows.length} products holding ${money(capital)} of stock against weak demand.`;
    }
    case "low-margin":
      return `${rows.length} products below ${Math.round((query.marginBelow ?? 0.3) * 100)}% contribution margin, on ${money(revenue)} of trailing revenue.`;
    case "cost-increase": {
      const worst = rows[0];
      return `${rows.length} products with rising landed cost. Worst is ${worst?.product.name} at ${((worst?.economics.costDrift ?? 0) * 100).toFixed(1)}%.`;
    }
    case "hygiene":
      return `${rows.length} live products with a missing image or description, on ${money(revenue)} of trailing revenue.`;
    case "on-promotion":
      return `${rows.length} products on an active promotion, generating ${money(revenue)} in the last 28 days.`;
    case "slow-moving":
      return `${rows.length} of the slowest live products, ${rows.reduce((total, row) => total + row.units28, 0)} units between them in 28 days.`;
    case "top-revenue":
      return `Top ${rows.length} products by revenue, ${money(revenue)} in the last 28 days.`;
    default:
      return `${rows.length} products.`;
  }
}
