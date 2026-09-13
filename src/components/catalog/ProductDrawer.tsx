"use client";

/**
 * One product, in full, with the inventory arithmetic written out.
 *
 * Showing the formula next to the numbers is the point. A merchandiser asked to
 * commit spend on a suggested order will want to know where the number came
 * from, and "the system said so" is how these tools stop being used.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { SERVICE_LEVEL, SERVICE_Z } from "@/lib/inventory";
import { breakevenPrice } from "@/lib/margin";
import { money, moneyCents, percent, days as formatDays } from "@/lib/format";
import { Meter, StatePill } from "@/components/ui/primitives";
import type { Row } from "@/lib/select";
import type { ConsoleApi } from "@/state/useConsole";

export function ProductDrawer({
  row,
  api,
  onClose,
}: {
  row: Row;
  api: ConsoleApi;
  onClose: () => void;
}) {
  const { product, inventory, economics: unit, vendor } = row;
  const [price, setPrice] = useState(product.price.toFixed(2));
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the drawer when it opens, so keyboard users are not left
  // tabbing through the page behind it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsedPrice = Number.parseFloat(price);
  const priceChanged =
    Number.isFinite(parsedPrice) && Math.abs(parsedPrice - product.price) > 0.005;

  return (
    <>
      <button
        type="button"
        className="drawer-scrim"
        aria-label="Close product details"
        onClick={onClose}
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${product.name} details`}
      >
        <header className="drawer-head">
          <div>
            <div className="row" style={{ marginBottom: 4 }}>
              <span className="badge">{row.category.name}</span>
              <span className={`badge ${product.status === "live" ? "green" : ""}`}>
                {product.status}
              </span>
              <StatePill state={inventory.state} />
            </div>
            <h3>{product.name}</h3>
            <span className="sku">{product.sku} · {vendor.name}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="button ghost small"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body stack">
          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>Unit economics</div>
            <dl>
              <div className="kv"><dt>List price</dt><dd>{moneyCents(product.price)}</dd></div>
              <div className="kv"><dt>Landed unit cost</dt><dd>{moneyCents(product.unitCost)}</dd></div>
              <div className="kv">
                <dt>Cost 12 weeks ago</dt>
                <dd className={unit.costDrift > 0.05 ? "down" : ""}>
                  {moneyCents(product.priorUnitCost)}
                  {Math.abs(unit.costDrift) > 0.005 && ` (${unit.costDrift > 0 ? "+" : ""}${(unit.costDrift * 100).toFixed(1)}%)`}
                </dd>
              </div>
              <div className="kv"><dt>Fulfilment</dt><dd>{moneyCents(product.fulfilmentCost)}</dd></div>
              <div className="kv">
                <dt>Channel fees ({product.channels.join(", ")})</dt>
                <dd>{moneyCents(unit.fees)}</dd>
              </div>
              <div className="kv">
                <dt style={{ color: "var(--text)", fontWeight: 600 }}>Contribution per unit</dt>
                <dd className={unit.contribution <= 0 ? "down" : "up"} style={{ fontWeight: 700 }}>
                  {moneyCents(unit.contribution)} · {percent(unit.marginRate, 1)}
                </dd>
              </div>
              <div className="kv">
                <dt>Break-even price</dt>
                <dd>{moneyCents(breakevenPrice(product))}</dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>
              Stock and replenishment
            </div>
            <dl>
              <div className="kv"><dt>On hand</dt><dd>{product.onHand}</dd></div>
              <div className="kv"><dt>Committed</dt><dd>{product.committed}</dd></div>
              <div className="kv"><dt>Available</dt><dd>{inventory.available}</dd></div>
              <div className="kv"><dt>On order</dt><dd>{product.onOrder}</dd></div>
              <div className="kv">
                <dt>Velocity (28-day mean)</dt>
                <dd>{inventory.velocity.daily.toFixed(2)} / day</dd>
              </div>
              <div className="kv">
                <dt>Daily variability (σ)</dt>
                <dd>{inventory.velocity.sigma.toFixed(2)}</dd>
              </div>
              <div className="kv">
                <dt>Days of cover</dt>
                <dd>{formatDays(inventory.daysOfCover)}</dd>
              </div>
              <div className="kv">
                <dt>Vendor lead time (quoted)</dt>
                <dd>{vendor.quotedLeadDays} days</dd>
              </div>
            </dl>

            <div className="formula" style={{ marginTop: "var(--s3)" }}>
              safety stock = z · σ · √L<br />
              &nbsp;&nbsp;= {SERVICE_Z} · {inventory.velocity.sigma.toFixed(2)} · √
              {vendor.quotedLeadDays} = <b>{inventory.safetyStock.toFixed(0)} units</b>
              <br />
              <br />
              reorder point = v · L + safety stock<br />
              &nbsp;&nbsp;= {inventory.velocity.daily.toFixed(2)} · {vendor.quotedLeadDays} +{" "}
              {inventory.safetyStock.toFixed(0)} ={" "}
              <b>{inventory.reorderPoint.toFixed(0)} units</b>
            </div>

            <div style={{ marginTop: "var(--s3)" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "var(--text-sm)" }}>
                  Stockout risk inside the lead time
                </span>
                <span
                  className="tabular"
                  style={{ fontWeight: 700, color: inventory.stockoutRisk > 0.4 ? "var(--red-600)" : "var(--text)" }}
                >
                  {percent(inventory.stockoutRisk)}
                </span>
              </div>
              <Meter value={inventory.stockoutRisk} tone={inventory.stockoutRisk > 0.4 ? "red" : "amber"} />
              <p style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
                Probability that demand over {vendor.quotedLeadDays} days exceeds the{" "}
                {inventory.available + product.onOrder} units available plus on order, at a{" "}
                {percent(SERVICE_LEVEL)} service level.
              </p>
            </div>

            {inventory.suggestedOrder > 0 && (
              <div className="notice warning" style={{ marginTop: "var(--s3)" }}>
                <span>
                  Suggested order <strong>{inventory.suggestedOrder} units</strong> from{" "}
                  {vendor.name}. Minimum order quantity is {vendor.moq}. That is{" "}
                  {money(inventory.suggestedOrder * product.unitCost)} at current cost.
                </span>
              </div>
            )}
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>
              Trailing performance
            </div>
            <dl>
              <div className="kv"><dt>28-day units</dt><dd>{row.units28}</dd></div>
              <div className="kv"><dt>28-day revenue</dt><dd>{money(row.revenue28)}</dd></div>
              <div className="kv">
                <dt>Prior 28-day revenue</dt>
                <dd>{money(row.revenuePrior28)}</dd>
              </div>
              <div className="kv">
                <dt>28-day contribution</dt>
                <dd>{money(row.contribution28)}</dd>
              </div>
              {row.promotion && (
                <div className="kv">
                  <dt>Promotion</dt>
                  <dd>
                    {row.promotion.name} ({row.promotion.status})
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>Adjust</div>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Price</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value.replace(/[^\d.]/g, ""))}
                />
              </label>
              <button
                type="button"
                className="button primary"
                disabled={!priceChanged}
                onClick={() => api.edit(product.sku, { price: Math.round(parsedPrice * 100) / 100 })}
              >
                Save price
              </button>
            </div>

            <div className="row" style={{ marginTop: "var(--s3)" }}>
              {(["live", "paused", "draft", "discontinued"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`chip ${product.status === status ? "on" : ""}`}
                  aria-pressed={product.status === status}
                  onClick={() => api.edit(product.sku, { status })}
                >
                  {status}
                </button>
              ))}
            </div>

            <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-xs)" }}>
              Edits apply on top of the generated dataset and are stored in this browser.
              Every derived figure above recalculates immediately. Reset from the Vendors
              screen restores the original catalog.
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}
