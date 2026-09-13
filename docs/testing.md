# Testing

```bash
npm test           # 91 tests
npm run typecheck  # strict, with noUncheckedIndexedAccess
npm run lint
```

| File | Covers |
| --- | --- |
| [`src/lib/inventory.test.ts`](../src/lib/inventory.test.ts) | Velocity counting zero sale days, square root scaling of safety stock asserted against the linear alternative, the normal CDF against known quantiles, risk monotonic in stock and lead time, the minimum order quantity, and that the suggested quantity can be rebuilt from the values the panel shows. |
| [`src/lib/margin.test.ts`](../src/lib/margin.test.ts) | The worst channel fee rule, break-even price yielding exactly zero contribution, break-even lift against its closed form, and infinite required lift below cost. |
| [`src/lib/format.test.ts`](../src/lib/format.test.ts) | Bounded probability display at both ends, and that share percentages still round plainly. |
| [`src/lib/data.test.ts`](../src/lib/data.test.ts) | Determinism across runs, referential integrity, no receipt before its order, the skewed revenue distribution, every inventory state present, vendor components summing to the headline score, alert ordering and uniqueness, and query parsing in the question box. |

## Three defects these tests or the output review caught

**The order quantity could not be reproduced from the panel.** The panel printed
the reorder point and the final quantity but not the order up to level between
them, so a reader working from the displayed rows would compute 825 units
against a suggestion of 2496. The intermediate is now exposed and tested.

**Stockout probability displayed as a certainty.** Rounding to whole percent
turned a modeled 99.97 percent into `100%` and a 0.4 percent risk into `0%`.
Both ends are now bounded.

**The reorder point rounded two ways.** The table used `ceil` and the panel used
`toFixed(0)`, so the same SKU showed 1780 on one screen and 1779 on another.

Three data defects were found by inspecting the generated output rather than by
a test, and are described in [limitations](limitations.md).

## What these tests do not establish

They cover functional correctness of the calculations. They do not establish
that the demand model fits any real assortment, that the vendor weights are the
right weights, or that following the suggestions would improve a real inventory
position. Those are empirical questions that would need real data.
