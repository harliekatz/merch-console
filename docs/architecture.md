# Architecture

Vite, React 19 and TypeScript in strict mode. The build is a static bundle with
no backend, no account and no network call.

```
src/
├── lib/
│   ├── rng.ts        seeded random numbers, including a Poisson draw for unit counts
│   ├── generate.ts   the catalog, sales history, receipts and promotions
│   ├── types.ts      the unified model
│   ├── inventory.ts  velocity, safety stock, reorder point, stockout probability
│   ├── margin.ts     contribution, break-even price, promotion break-even lift
│   ├── vendors.ts    the weighted health composite
│   ├── select.ts     the joins, indexed once
│   ├── alerts.ts     eight rules, ranked by severity then dollars at stake
│   ├── ask.ts        query parsing and execution for the question box
│   └── format.ts     display helpers, including bounded probabilities
├── state/useConsole.ts  the one stateful hook
└── components/          presentation
```

## The unified model

The premise is that product, vendor, inventory, pricing, promotion and sales
data sit in one place, which is only worth anything if there is a schema behind
it. Entities are joined by id in [`src/lib/select.ts`](../src/lib/select.ts),
which builds a `Row` carrying the product, its vendor, its category, its unit
economics, its inventory assessment and any promotion covering it. Every screen
reads those rows.

The joins are built once and indexed, because the catalog table filters and
sorts over them on every keystroke.

## Pure calculation, presentational components

`lib/` contains no React import, so the merchandising math is testable without
mounting anything. Components read derived rows and render them. A few
aggregates over the visible rows, such as the totals above the inventory table,
are computed in the component that shows them.

## State

The generated dataset is immutable. Edits a user makes are held separately as a
patch map and applied on read, so the catalog can be changed and reset without
mutating the source, and every derived figure recomputes down the same path
whether or not anything has been edited.

The whole derivation, meaning 240 joins plus inventory assessment, vendor
scoring and the alert engine, runs in a single memo keyed on the patch map. It
takes a few milliseconds, which is cheaper than maintaining an invalidation
scheme and removes the class of bug where one screen shows a stale number.

## The question box

[`src/lib/ask.ts`](../src/lib/ask.ts) matches a typed question against eight
query shapes and parses a category, vendor, percentage threshold and row limit
out of it. There is no language model. The parsed query is displayed above the
results, and an unmatched question returns nothing with a list of what the box
can answer rather than a guess.

A model could pick the query without changing the layer underneath, and the
query would still be shown.
