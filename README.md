# Merch Console

A merchandising workspace that joins product, vendor, inventory, pricing, promotion and sales data into one view, then answers the questions a merchandiser actually has to decide on each week.

**Demo.** [merch-console.netlify.app](https://merch-console.netlify.app)

![The overview screen with headline figures, revenue against the prior period, category mix and the ranked alert queue](docs/screens/01-overview.png)

## The decisions it supports

**What to reorder, and how much.** For every SKU the console combines 28 day sales velocity, current stock net of committed units, units already on order, and the vendor's quoted lead time and minimum order quantity. It returns a suggested quantity, what that costs at landed unit cost, and the full working. Rows are ranked by margin at risk rather than by remaining units, because a cheap SKU with two units left looks alarming and is worth $30, while a fast mover sitting under its reorder point on a 45 day lead time looks fine and is worth thousands. The console calculates and exports to CSV. It does not place orders.

**Whether a product is actually profitable.** Contribution margin after landed cost, fulfillment and the worst channel fee the product is exposed to, rather than gross margin. A SKU at 42 percent gross carrying $7 of fulfillment and a 15 percent marketplace fee is a different business from one that ships in an envelope.

**Whether a promotion is paying for itself.** Every discount shows the lift it needs to hold contribution flat, `CM₀ / CM₁ - 1`, against the lift actually observed. On a 45 percent contribution margin a 20 percent discount needs roughly 80 percent more units to stand still.

Underneath those, a vendor scorecard grades suppliers on fill rate, delivery timing, lead time consistency, quality and cost movement, all computed from purchase order receipts. An eight rule alert queue surfaces stockouts, below cost pricing, margin erosion, dead stock and underperforming promotions, ranked by severity and then by dollars at stake.

![The product panel leading with the suggested quantity and cost, with the derivation available underneath](docs/screens/03-product-drawer.png)

## Why I built it

At PlanetArt I worked in product operations and merchandising. Assortment, pricing and replenishment questions each meant opening a different tool and rebuilding the same joins by hand. I mapped where the workflow fragmented and prototyped a centralized system, which I presented to engineering.

This repository is my own build of that idea, written from scratch outside of work. It contains no employer data, schema or code. The catalog of 240 products, 10 vendors, 90 days of sales and roughly 120 purchase order receipts is generated from a fixed seed by [`src/lib/generate.ts`](src/lib/generate.ts).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # 91 tests
npm run typecheck
npm run lint
npm run build      # static bundle in dist/
```

No environment variables are needed. There is no backend and no account.

## Implementation notes

- [Architecture](docs/architecture.md) covers the unified model, the joins and how state is held.
- [Replenishment model](docs/replenishment.md) covers the order quantity, the stockout probability and the assumptions behind both.
- [Testing](docs/testing.md) lists what the suite covers and what it does not.
- [Limitations](docs/limitations.md) covers demand modeling, quoted versus actual lead times and the absence of a purchasing workflow.

## License

MIT, see [LICENSE](LICENSE). Built by [Harlie Katz](https://harliekatz.netlify.app). All products, vendors, prices, receipts and sales in this application are synthetic.
