"use client";

/**
 * The morning screen.
 *
 * The ordering is deliberate: the four numbers a merchandiser is measured on,
 * then the trend behind them, then the queue of things that need a decision
 * today. Alerts sit above the category mix because the mix is a report and the
 * alerts are work.
 */
import { AlertTriangle, ArrowRight, Boxes, DollarSign, Percent, X } from "lucide-react";
import { count, money, percent } from "@/lib/format";
import { Kpi, LineChart, Meter, Sparkline } from "@/components/ui/primitives";
import type { ConsoleApi } from "@/state/useConsole";

export function Overview({
  api,
  onOpenSku,
  onSeeAll,
}: {
  api: ConsoleApi;
  onOpenSku: (sku: string) => void;
  onSeeAll: () => void;
}) {
  const { totals, categories, alerts, indexed } = api;

  // Series run oldest to newest for reading left to right; the store keeps them
  // newest first because everything else asks "how many days ago".
  const current = indexed.dailyRevenue.slice(0, 28).reverse();
  const prior = indexed.dailyRevenue.slice(28, 56).reverse();

  const urgent = alerts.filter((alert) => alert.severity === "urgent");
  const top = alerts.slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            Product, vendor, inventory, pricing, promotion and sales data joined into one
            view. Figures cover the trailing 28 days to {api.data.referenceDate}.
          </p>
        </div>
      </div>

      <div className="grid-4">
        <Kpi
          label="Net revenue"
          value={money(totals.revenue28)}
          change={totals.revenueChange}
          foot="vs prior 28 days"
          icon={<DollarSign size={12} aria-hidden="true" />}
        >
          <Sparkline values={current} />
        </Kpi>

        <Kpi
          label="Contribution"
          value={money(totals.contribution28)}
          foot={`${percent(totals.marginRate, 1)} of revenue, after cost, fulfilment and fees`}
          icon={<Percent size={12} aria-hidden="true" />}
        />

        <Kpi
          label="Revenue at risk"
          value={money(totals.atRiskRevenue)}
          foot={`${totals.atRiskSkus} SKUs out of stock or running out`}
          icon={<AlertTriangle size={12} aria-hidden="true" />}
        />

        <Kpi
          label="Inventory held"
          value={money(totals.inventoryValue)}
          foot={`${money(totals.deadStockValue)} slow or dormant`}
          icon={<Boxes size={12} aria-hidden="true" />}
        />
      </div>

      <div className="split" style={{ marginTop: "var(--s4)" }}>
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Daily revenue</h3>
              <p>Trailing 28 days against the 28 before it, on one scale.</p>
            </div>
            <div className="row" style={{ gap: "var(--s3)" }}>
              <span className="row" style={{ gap: 5, fontSize: "var(--text-sm)" }}>
                <span style={{ width: 14, height: 2, background: "var(--green-500)" }} />
                Current
              </span>
              <span className="row" style={{ gap: 5, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                <span style={{ width: 14, height: 2, background: "var(--text-faint)" }} />
                Prior
              </span>
            </div>
          </div>
          <div className="card-pad-sm">
            <LineChart
              series={[
                { values: prior, color: "var(--text-faint)", dashed: true, label: "Prior period" },
                { values: current, color: "var(--green-500)", label: "Current period" },
              ]}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Category mix</h3>
              <p>Revenue share and contribution margin.</p>
            </div>
          </div>
          <div className="card-pad-sm">
            {categories.map((slice) => (
              <div className="mix-row" key={slice.category.id}>
                <span className="mix-name">{slice.category.name}</span>
                <Meter value={slice.share / (categories[0]?.share ?? 1)} tone="blue" />
                <span className="mix-num">{money(slice.revenue28)}</span>
                {/* Half a point of tolerance, so a category that rounds to
                    exactly its target does not render red beside a number
                    identical to the one it is being judged against. */}
                <span
                  className={`mix-num hide-sm ${slice.marginRate >= slice.category.targetMargin - 0.005 ? "up" : "down"}`}
                  title={`Target ${percent(slice.category.targetMargin)}`}
                >
                  {percent(slice.marginRate)}
                </span>
              </div>
            ))}
            <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-xs)" }}>
              Margin is shown against each category&apos;s target. Green means at or above.
            </p>
          </div>
        </section>
      </div>

      <section className="card section">
        <div className="card-head">
          <div>
            <h3>Needs a decision</h3>
            <p>
              {urgent.length} urgent, {alerts.length} in total. Ranked by severity, then by
              the dollars each one puts at stake.
            </p>
          </div>
          <button type="button" className="button small" onClick={onSeeAll}>
            Open catalog
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>

        {top.length === 0 ? (
          <div className="card-pad" style={{ textAlign: "center", color: "var(--text-muted)" }}>
            Nothing outstanding. Every rule is clear against the current catalog.
          </div>
        ) : (
          <div>
            {top.map((alert) => (
              <div className="alert" key={alert.id}>
                <span className={`alert-mark ${alert.severity}`} aria-hidden="true" />
                <div className="alert-body">
                  <div className="alert-title">
                    {alert.sku ? (
                      <button
                        type="button"
                        onClick={() => onOpenSku(alert.sku as string)}
                        style={{ textAlign: "left", font: "inherit", color: "inherit" }}
                      >
                        {alert.title}
                      </button>
                    ) : (
                      alert.title
                    )}
                  </div>
                  <div className="alert-detail">{alert.detail}</div>
                  <div className="alert-action">{alert.action}</div>
                </div>
                <div className="alert-stake">
                  <div>{money(alert.atStake)}</div>
                  <div style={{ fontSize: "var(--text-xs)" }}>at stake</div>
                </div>
                <button
                  type="button"
                  className="button ghost small"
                  aria-label={`Dismiss: ${alert.title}`}
                  onClick={() => api.dismiss(alert.id)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid-3 section">
        <div className="card card-pad">
          <div className="eyebrow">Catalog</div>
          <p style={{ marginTop: "var(--s2)", fontSize: "var(--text-sm)" }}>
            {count(totals.liveSkus)} live of {count(api.rows.length)} SKUs across{" "}
            {api.data.categories.length} categories and {api.data.vendors.length} vendors.
          </p>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Units sold</div>
          <p style={{ marginTop: "var(--s2)", fontSize: "var(--text-sm)" }}>
            {count(totals.units28)} units in 28 days, an average order value of{" "}
            {money(totals.units28 === 0 ? 0 : totals.revenue28 / totals.units28)} a unit.
          </p>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Promotions</div>
          <p style={{ marginTop: "var(--s2)", fontSize: "var(--text-sm)" }}>
            {api.data.promotions.filter((promotion) => promotion.status === "active").length}{" "}
            running,{" "}
            {api.data.promotions.filter((promotion) => promotion.status === "scheduled").length}{" "}
            scheduled.
          </p>
        </div>
      </div>

      <div className="disclosure">
        <strong>About this data.</strong> Every product, vendor, price, receipt and sale in
        this console is generated from a fixed seed. It contains no employer data, schema or
        code. The catalog is shaped to resemble a mid-size print-on-demand assortment
        because that is the kind of problem the tool is built for.
      </div>
    </div>
  );
}
