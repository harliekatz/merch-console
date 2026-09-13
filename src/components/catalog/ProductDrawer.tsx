"use client";

/**
 * One product, in full.
 *
 * The panel leads with the decision. Suggested quantity, what it costs and the
 * one-line reason come first, and the derivation sits underneath in a section
 * the reader opens. A merchandiser committing spend needs to be able to
 * reproduce the number, but not before they know what the number is.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { SERVICE_Z } from "@/lib/inventory";
import { breakevenPrice } from "@/lib/margin";
import {
  count,
  money,
  moneyCents,
  percent,
  probability,
  days as formatDays,
} from "@/lib/format";
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
  const [showWorking, setShowWorking] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Remember what opened the drawer so focus can go back there on close.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab inside the dialog. Without this, tabbing past the last control
      // walks into the page behind an aria-modal element, which is the specific
      // thing aria-modal tells assistive technology cannot happen.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
        ref={panelRef}
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
          {/* The decision comes first. Quantity, cost and reason are what the
              reader came for; the derivation is one disclosure below. */}
          {inventory.suggestedOrder > 0 && (
            <section className="decision">
              <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>
                Replenishment
              </div>

              <div className="decision-head">
                <div>
                  <div className="decision-value tabular">
                    {count(inventory.suggestedOrder)}
                    <span className="decision-unit"> units</span>
                  </div>
                  <div className="decision-cost">
                    {money(inventory.suggestedOrder * product.unitCost)} at{" "}
                    {moneyCents(product.unitCost)} landed cost per unit
                  </div>
                </div>
                <span className="badge">{vendor.name}</span>
              </div>

              <p className="decision-reason">
                {inventory.moqBound
                  ? `${vendor.name} has a ${count(vendor.moq)} unit minimum, which sets this quantity. The calculated shortfall is ${count(Math.ceil(inventory.orderUpTo - inventory.available - product.onOrder))} units.`
                  : `Covers the ${vendor.quotedLeadDays} day lead time and the safety stock that protects it, leaving one further lead time of demand on arrival. Current position is ${count(inventory.available)} units available against a reorder point of ${count(Math.ceil(inventory.reorderPoint))}.`}
              </p>

              <button
                type="button"
                className="disclosure-toggle"
                aria-expanded={showWorking}
                onClick={() => setShowWorking((open) => !open)}
              >
                {showWorking ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
                {showWorking ? "Hide the working" : "Show the working"}
              </button>

              {showWorking && (
                <div className="formula" style={{ marginTop: "var(--s2)" }}>
                  v = {inventory.velocity.daily.toFixed(2)} units/day (28 day mean)
                  <br />
                  σ = {inventory.velocity.sigma.toFixed(2)} units/day (daily standard
                  deviation)
                  <br />
                  L = {vendor.quotedLeadDays} days (vendor quoted lead time)
                  <br />
                  <br />
                  lead time demand = v · L = <b>
                    {inventory.leadTimeDemand.toFixed(1)} units
                  </b>
                  <br />
                  safety stock = {SERVICE_Z} · σ · √L ={" "}
                  <b>{inventory.safetyStock.toFixed(1)} units</b>
                  <br />
                  reorder point = v · L + safety stock ={" "}
                  <b>{inventory.reorderPoint.toFixed(1)} units</b>
                  <br />
                  order up to = reorder point + v · L ={" "}
                  <b>{inventory.orderUpTo.toFixed(1)} units</b>
                  <br />
                  <br />
                  order = order up to − available − on order
                  <br />
                  &nbsp;&nbsp;= {inventory.orderUpTo.toFixed(1)} −{" "}
                  {inventory.available} − {product.onOrder} ={" "}
                  {Math.max(0, inventory.orderUpTo - inventory.available - product.onOrder).toFixed(1)}
                  <br />
                  &nbsp;&nbsp;rounded up, floored at the {count(vendor.moq)} unit MOQ ={" "}
                  <b>{count(inventory.suggestedOrder)} units</b>
                </div>
              )}

              <p className="decision-note">
                This is a calculation and a CSV export. The console does not place
                orders.
              </p>
            </section>
          )}

          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>
              Stock position
            </div>
            <dl>
              <div className="kv"><dt>On hand</dt><dd>{count(product.onHand)} units</dd></div>
              <div className="kv"><dt>Committed to orders</dt><dd>{count(product.committed)} units</dd></div>
              <div className="kv"><dt>Available to sell</dt><dd>{count(inventory.available)} units</dd></div>
              <div className="kv"><dt>On order</dt><dd>{count(product.onOrder)} units</dd></div>
              <div className="kv">
                <dt>Sales velocity, 28 day mean</dt>
                <dd>{inventory.velocity.daily.toFixed(2)} units/day</dd>
              </div>
              <div className="kv">
                <dt>Daily standard deviation</dt>
                <dd>{inventory.velocity.sigma.toFixed(2)} units/day</dd>
              </div>
              <div className="kv"><dt>Days of cover</dt><dd>{formatDays(inventory.daysOfCover)}</dd></div>
              <div className="kv">
                <dt>Vendor lead time, quoted</dt>
                <dd>{vendor.quotedLeadDays} days</dd>
              </div>
              <div className="kv">
                <dt>Reorder point</dt>
                <dd>{count(Math.ceil(inventory.reorderPoint))} units</dd>
              </div>
            </dl>

            <div style={{ marginTop: "var(--s3)" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "var(--text-sm)" }}>
                  Chance of running out before a restock arrives
                </span>
                <span
                  className="tabular"
                  style={{
                    fontWeight: 700,
                    color: inventory.stockoutRisk > 0.4 ? "var(--red-600)" : "var(--text)",
                  }}
                >
                  {probability(inventory.stockoutRisk)}
                </span>
              </div>
              <Meter
                value={inventory.stockoutRisk}
                tone={inventory.stockoutRisk > 0.4 ? "red" : "amber"}
              />
              <p style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
                Modeled probability that demand over the next {vendor.quotedLeadDays}{" "}
                days exceeds the {count(inventory.available + product.onOrder)} units
                available plus on order. Demand over the lead time is treated as normal
                with mean v · L and standard deviation σ · √L.
              </p>
            </div>
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>
              Unit economics
            </div>
            <dl>
              <div className="kv"><dt>List price</dt><dd>{moneyCents(product.price)} per unit</dd></div>
              <div className="kv"><dt>Landed cost</dt><dd>{moneyCents(product.unitCost)} per unit</dd></div>
              <div className="kv">
                <dt>Landed cost 12 weeks ago</dt>
                <dd className={unit.costDrift > 0.05 ? "down" : ""}>
                  {moneyCents(product.priorUnitCost)} per unit
                  {Math.abs(unit.costDrift) > 0.005 &&
                    ` (${unit.costDrift > 0 ? "+" : ""}${(unit.costDrift * 100).toFixed(1)}% change)`}
                </dd>
              </div>
              <div className="kv">
                <dt>Fulfillment cost</dt>
                <dd>{moneyCents(product.fulfilmentCost)} per unit</dd>
              </div>
              <div className="kv">
                <dt>Channel fee, {product.channels.join(" and ")}</dt>
                <dd>{moneyCents(unit.fees)} per unit</dd>
              </div>
              <div className="kv">
                <dt style={{ color: "var(--text)", fontWeight: 600 }}>Contribution</dt>
                <dd className={unit.contribution <= 0 ? "down" : "up"} style={{ fontWeight: 700 }}>
                  {moneyCents(unit.contribution)} per unit, {percent(unit.marginRate, 1)} of
                  price
                </dd>
              </div>
              <div className="kv">
                <dt>Break-even price</dt>
                <dd>{moneyCents(breakevenPrice(product))} per unit</dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: "var(--s2)" }}>
              Trailing 28 days
            </div>
            <dl>
              <div className="kv"><dt>Units sold</dt><dd>{count(row.units28)} units</dd></div>
              <div className="kv"><dt>Revenue</dt><dd>{money(row.revenue28)}</dd></div>
              <div className="kv">
                <dt>Revenue, prior 28 days</dt>
                <dd>{money(row.revenuePrior28)}</dd>
              </div>
              <div className="kv"><dt>Contribution</dt><dd>{money(row.contribution28)}</dd></div>
              {row.promotion && (
                <div className="kv">
                  <dt>Promotion</dt>
                  <dd>{row.promotion.name}, {row.promotion.status}</dd>
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
