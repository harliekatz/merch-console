# Replenishment model

## The order quantity

A continuous review model. Definitions first, all in the units the interface
shows.

```
v   mean daily units over the trailing 28 days, in units per day
σ   standard deviation of those daily units, in units per day
L   the vendor's quoted lead time, in days
z   1.645, the normal quantile for a 95 percent service level
```

```
lead time demand = v · L
safety stock     = z · σ · √L
reorder point    = v · L + safety stock
order up to      = reorder point + v · L
suggested order  = max(MOQ, ceil(order up to - available - on order))
```

`available` is units on hand less units committed to orders not yet shipped.

### A worked example

Take SKU TEC-1012 from the seeded catalog, supplied by Kestrel Goods.

```
on hand 1027, committed 72, available 955, on order 0
v = 37.14 units/day, σ = 9.80 units/day, L = 45 days, MOQ 200

lead time demand = 37.14 × 45                 = 1671.4 units
safety stock     = 1.645 × 9.80 × √45         =  108.1 units
reorder point    = 1671.4 + 108.1             = 1779.5 units
order up to      = 1779.5 + 1671.4            = 3451.0 units
suggested order  = ceil(3451.0 - 955 - 0)     = 2496 units
cost             = 2496 × $38.50 landed       = $96,096
```

The product panel prints this chain with the SKU's own numbers behind a "show
the working" toggle, so the figure can be reproduced without reading source.

### Two things worth knowing about it

**Why the order goes past the reorder point.** Ordering up to the reorder point
would put the SKU straight back into reorder territory the day the shipment
lands. The target adds one further lead time of demand, which is why the
quantity is roughly `2·v·L + safety stock` rather than the 825 units that
`reorder point - available` would suggest. This intermediate step was missing
from the panel, which made the number impossible to reproduce from what was on
screen.

**Why safety stock uses √L.** Variance adds over independent days, so the
standard deviation of demand across a lead time grows with the square root of
that lead time rather than in proportion to it. Treating it linearly overstates
safety stock substantially on long lead vendors, and this catalog has one
quoting 45 days. A test asserts the square root behavior against the linear
alternative.

**Cost basis.** The quantity is multiplied by landed unit cost, which is what a
purchase order is written against. It excludes outbound fulfillment, which
belongs to the sale rather than the purchase.

## Stockout probability

This is a separate number from the service level, and the two are easy to
confuse.

The **service level** is an input. At 95 percent it sets `z = 1.645`, which
sizes safety stock. It describes the policy.

The **stockout probability** is an output. It is computed against the position
the SKU is actually in right now.

```
P(stockout) = 1 - Φ( (available + on order - v·L) / (σ·√L) )
```

Demand over the lead time is treated as normal with mean `v·L` and standard
deviation `σ·√L`. Φ is the standard normal cumulative distribution, implemented
with the Abramowitz and Stegun 7.1.26 error function approximation.

For TEC-1012 above, `z = (955 - 1671.4) / (9.80 × √45) = -10.9`, so the modeled
probability saturates and the panel shows `>99%`.

### How it is displayed

The value is shown as a bounded figure rather than a rounded percentage.
Anything at or above 99.5 percent displays as `>99%` and anything below 0.5
percent but above zero displays as `<1%`. Rounding to whole percent turned a
modeled 99.97 percent into `100%`, which asserts a certainty the model does not
produce, and turned a 0.4 percent risk into `0%`, which is indistinguishable
from no risk at all. The same bounds are used in alert text and in the CSV
export.

### Assumptions

**Demand during the lead time is normal.** For slow movers it is closer to
Poisson, and the normal approximation misstates the tail, which is where a
stockout probability lives. Adequate at the volumes most of this catalog runs
at, weaker on the long tail.

**Lead time is the vendor's quoted figure, treated as fixed.** Variability in
delivery is not carried into the probability, only variability in demand. The
console measures actual lead time on the vendor screen and does not yet feed it
back here. See [limitations](limitations.md).

**Velocity is a flat 28 day mean.** No trend term, no seasonal adjustment, no
correction for days the SKU was on promotion or out of stock.
