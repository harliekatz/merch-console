"use client";

/**
 * The replenishment planner.
 *
 * Ranked by margin at risk rather than by how low the stock looks, because those
 * two orderings disagree constantly. A cheap SKU with two units left is visually
 * alarming and worth $30; a high-velocity SKU sitting just under its reorder
 * point on a 45-day lead time is worth thousands and looks fine on a shelf.
 */
import { useMemo, useState } from "react";
import { Download, Package } from "lucide-react";
import { OVERSTOCK_DAYS } from "@/lib/inventory";
import { money, percent, days as formatDays } from "@/lib/format";
import { EmptyRow, Kpi, StatePill } from "@/components/ui/primitives";
import type { Row } from "@/lib/select";
import type { ConsoleApi } from "@/state/useConsole";

type Lens = "replenish" | "overstock" | "all";

export function Inventory({
  api,
  onOpenSku,
}: {
  api: ConsoleApi;
  onOpenSku: (sku: string) => void;
}) {
  const [lens, setLens] = useState<Lens>("replenish");

  const rows = useMemo(() => {
    if (lens === "replenish") {
      return api.rows
        .filter(
          (row) =>
            row.inventory.state === "stockout" ||
            row.inventory.state === "at-risk" ||
            row.inventory.state === "reorder",
        )
        .sort((a, b) => b.inventory.marginAtRisk - a.inventory.marginAtRisk);
    }
    if (lens === "overstock") {
      return api.rows
        .filter(
          (row) =>
            row.inventory.state === "overstock" || row.inventory.state === "dormant",
        )
        .sort(
          (a, b) =>
            b.product.onHand * b.product.unitCost - a.product.onHand * a.product.unitCost,
        );
    }
    return [...api.rows].sort(
      (a, b) => b.inventory.stockoutRisk - a.inventory.stockoutRisk,
    );
  }, [api.rows, lens]);

  const orderUnits = rows.reduce((sum, row) => sum + row.inventory.suggestedOrder, 0);
  const orderCost = rows.reduce(
    (sum, row) => sum + row.inventory.suggestedOrder * row.product.unitCost,
    0,
  );
  const marginAtRisk = rows.reduce((sum, row) => sum + row.inventory.marginAtRisk, 0);
  const heldCapital = rows.reduce(
    (sum, row) => sum + row.product.onHand * row.product.unitCost,
    0,
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p>
            Continuous-review planning at a 95% service level. Ranked by margin at risk,
            not by how low the number looks.
          </p>
        </div>
        <button
          type="button"
          className="button"
          disabled={rows.length === 0}
          onClick={() => exportOrders(rows)}
        >
          <Download size={14} aria-hidden="true" />
          Export order sheet
        </button>
      </div>

      <div className="grid-4">
        <Kpi label="SKUs in view" value={rows.length} foot={lensLabel(lens)} />
        <Kpi label="Suggested units" value={orderUnits.toLocaleString("en-US")} foot="across all vendors" />
        <Kpi label="Order cost" value={money(orderCost)} foot="at current landed cost" />
        <Kpi
          label={lens === "overstock" ? "Capital held" : "Margin at risk"}
          value={money(lens === "overstock" ? heldCapital : marginAtRisk)}
          foot={lens === "overstock" ? "in slow-moving stock" : "over the lead time"}
        />
      </div>

      <div className="card section">
        <div className="toolbar">
          {(["replenish", "overstock", "all"] as Lens[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`chip ${lens === option ? "on" : ""}`}
              aria-pressed={lens === option}
              onClick={() => setLens(option)}
            >
              {option === "replenish"
                ? "Needs replenishment"
                : option === "overstock"
                  ? `Over ${OVERSTOCK_DAYS} days cover`
                  : "All SKUs"}
            </button>
          ))}
          <span className="row-end muted" style={{ fontSize: "var(--text-sm)" }}>
            {lensLabel(lens)}
          </span>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Vendor</th>
                <th className="num">Lead</th>
                <th className="num">Avail</th>
                <th className="num">On order</th>
                <th className="num">Velocity</th>
                <th className="num">Cover</th>
                <th className="num">Reorder pt</th>
                <th className="num">Risk</th>
                <th className="num">At risk</th>
                <th className="num">Order</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={12}>
                  <Package size={22} style={{ margin: "0 auto var(--s2)", color: "var(--text-faint)" }} aria-hidden="true" />
                  <p>Nothing in this view. Every SKU is comfortably above its reorder point.</p>
                </EmptyRow>
              ) : (
                rows.slice(0, 120).map((row) => (
                  <tr key={row.product.sku}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onOpenSku(row.product.sku)}
                        style={{ textAlign: "left", font: "inherit" }}
                      >
                        <span className="strong" style={{ display: "block" }}>
                          {row.product.name}
                        </span>
                        <span className="sku">{row.product.sku}</span>
                      </button>
                    </td>
                    <td>{row.vendor.name}</td>
                    <td className="num">{row.vendor.quotedLeadDays}d</td>
                    <td className="num">{row.inventory.available}</td>
                    <td className="num">{row.product.onOrder || "—"}</td>
                    <td className="num">{row.inventory.velocity.daily.toFixed(1)}</td>
                    <td className="num">{formatDays(row.inventory.daysOfCover)}</td>
                    <td className="num">{Math.ceil(row.inventory.reorderPoint)}</td>
                    <td className={`num ${row.inventory.stockoutRisk > 0.4 ? "down" : ""}`}>
                      {percent(row.inventory.stockoutRisk)}
                    </td>
                    <td className="num">{money(row.inventory.marginAtRisk)}</td>
                    <td className="num strong">
                      {row.inventory.suggestedOrder > 0 ? row.inventory.suggestedOrder : "—"}
                    </td>
                    <td><StatePill state={row.inventory.state} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 120 && (
          <div className="card-pad-sm muted" style={{ fontSize: "var(--text-sm)" }}>
            Showing the top 120 of {rows.length}. Export for the full list.
          </div>
        )}
      </div>

      <div className="card card-pad section">
        <h3 style={{ marginBottom: "var(--s2)" }}>How the order quantity is derived</h3>
        <div className="formula">
          velocity <b>v</b> = mean daily units over 28 days (days with no sale count as zero)<br />
          variability <b>σ</b> = standard deviation of those daily units<br />
          safety stock = <b>1.645 · σ · √L</b> &nbsp; (95% service level)<br />
          reorder point = <b>v · L + safety stock</b><br />
          suggested order = <b>max(MOQ, reorder point + v · L − available − on order)</b>
        </div>
        <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-sm)" }}>
          The √L term is the part that gets done wrong in a spreadsheet. Variance adds over
          independent days, so the standard deviation of lead-time demand grows with the
          square root of the lead time, not in proportion to it. Treating it linearly
          overstates safety stock on long-lead vendors by a wide margin, and this catalog
          has one vendor quoting 45 days.
        </p>
      </div>
    </div>
  );
}

function lensLabel(lens: Lens): string {
  if (lens === "replenish") return "At or below reorder point";
  if (lens === "overstock") return "Slow-moving and dormant stock";
  return "Ranked by stockout risk";
}

function exportOrders(rows: Row[]): void {
  const header = [
    "SKU", "Product", "Vendor", "Lead days", "MOQ", "Available", "On order",
    "Daily velocity", "Reorder point", "Stockout risk %", "Suggested order",
    "Unit cost", "Order cost",
  ];

  const body = rows
    .filter((row) => row.inventory.suggestedOrder > 0)
    .map((row) => [
      row.product.sku,
      row.product.name,
      row.vendor.name,
      String(row.vendor.quotedLeadDays),
      String(row.vendor.moq),
      String(row.inventory.available),
      String(row.product.onOrder),
      row.inventory.velocity.daily.toFixed(2),
      row.inventory.reorderPoint.toFixed(0),
      (row.inventory.stockoutRisk * 100).toFixed(0),
      String(row.inventory.suggestedOrder),
      row.product.unitCost.toFixed(2),
      (row.inventory.suggestedOrder * row.product.unitCost).toFixed(2),
    ]);

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((line) => line.map(escape).join(",")).join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `replenishment-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
