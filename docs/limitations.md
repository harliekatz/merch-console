# Limitations

**Actual lead times are measured and not used.** The vendor screen computes each
supplier's real delivery time from purchase order receipts, and the planning math
still uses the quoted figure. A vendor quoting 45 days and delivering 65 is
under provisioning every SKU they supply. Feeding measured lead time and its
variance back into the reorder point is the single highest value change left
undone here.

**Demand during the lead time is modeled as normal.** For very slow movers it is
closer to Poisson, and the normal approximation misstates the tail, which is
exactly where a stockout probability lives.

**Velocity is a flat 28 day mean.** No trend, no seasonal decomposition, no
adjustment for days the SKU was promoted or out of stock. A product whose sales
doubled last week looks the same as one that has been flat. Exponential
smoothing with a trend term would be the first real improvement.

**There is no purchasing workflow.** Suggested orders calculate and export to
CSV. Nothing is approved, sent or received against.

**Overstock carries no cost of capital.** Dead stock is flagged by days of cover
and value, with no carrying cost or markdown curve behind the question of what
the stock is now worth.

**Promotion lift is not a clean counterfactual.** Observed lift compares promoted
days against the same SKU's own non promoted days as a daily rate. Seasonality
and the reason the SKU was chosen for the promotion both leak into that
comparison, so it is a signal rather than a measured causal effect.

**The question box is pattern matching.** Eight query shapes with parsed filters.
It declines rather than guessing when nothing matches.

**240 rows filter in memory.** At 50,000 SKUs the catalog table would need
virtualization and the joins would need to move behind an API.

**Accessibility work is implemented but not automatically checked.** Keyboard
operation, focus management on the product panel including a focus trap and
restoration, labeled controls, sortable headers carrying `aria-sort` and reduced
motion support are in the code. No accessibility check runs in continuous
integration and the app has not been tested with a screen reader.

## Three data defects found by inspecting the output

These were caught by reading the generated figures rather than by a test, and
are recorded because the generator now guards against them.

**Two thirds of inventory value read as dead stock.** Overstock was drawn
uniformly, which put 300 days of cover on the top sellers. Real overstock lands
on slow movers, so the draw is now weighted by velocity.

**Tech accessories showed an 11 percent margin.** Fulfillment cost was a flat
uniform draw, putting $6 of shipping on $10 products. It now scales with price,
and landed cost is solved backward from contribution margin rather than gross,
since contribution is what every screen reports.

**The dashboard opened on a 13 percent decline.** The seasonal curve was a sine
across the whole window, which placed the peak 45 days back. That was an
artifact of the curve rather than a property of the business.
