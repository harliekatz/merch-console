"use client";

/**
 * Promotion economics.
 *
 * The centre of this screen is the break-even lift: how many more units a
 * discount has to sell just to hold contribution flat. It is the most useful
 * number in promotional merchandising and it is almost never on the screen where
 * the discount gets chosen, which is how "20% off, that sounds reasonable" turns
 * into a quarter of margin nobody can account for.
 *
 * The observed lift beside it is a within-SKU comparison of promoted days
 * against that SKU's own non-promoted days. It is not a clean counterfactual and
 * the screen says so.
 */
import { useMemo, useState } from "react";
import { Info, Tag } from "lucide-react";
import { promoMath } from "@/lib/margin";
import { promoUnits } from "@/lib/alerts";
import { money, moneyCents } from "@/lib/format";
import { EmptyRow, Kpi } from "@/components/ui/primitives";
import type { Promotion } from "@/lib/types";
import type { ConsoleApi } from "@/state/useConsole";

export function Promotions({
  api,
  onOpenSku,
}: {
  api: ConsoleApi;
  onOpenSku: (sku: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    api.data.promotions.find((promotion) => promotion.status === "active")?.id ?? null,
  );

  const observed = useMemo(
    () => promoUnits(api.rows, api.data.promotions, api.indexed.salesBySku),
    [api.rows, api.data.promotions, api.indexed.salesBySku],
  );

  const selected =
    api.data.promotions.find((promotion) => promotion.id === selectedId) ?? null;

  const active = api.data.promotions.filter((promotion) => promotion.status === "active");
  const skusOnPromo = new Set(active.flatMap((promotion) => promotion.skus)).size;

  // Contribution given up across every active promotion, at observed volume.
  const givenUp = active.reduce((total, promotion) => {
    return (
      total +
      promotion.skus.reduce((subtotal, sku) => {
        const row = api.indexed.bySku.get(sku);
        if (!row) return subtotal;
        const math = promoMath(row.product, promotion.kind, promotion.value);
        const units = (observed.get(sku)?.promo ?? 0) * 28;
        return subtotal + (math.baseContribution - math.promoContribution) * units;
      }, 0)
    );
  }, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Promotions</h1>
          <p>
            What each discount has to earn back, against what it is actually earning.
          </p>
        </div>
      </div>

      <div className="grid-4">
        <Kpi label="Active" value={active.length} foot={`${skusOnPromo} SKUs discounted`} />
        <Kpi
          label="Scheduled"
          value={api.data.promotions.filter((promotion) => promotion.status === "scheduled").length}
          foot="not yet running"
        />
        <Kpi
          label="Ended"
          value={api.data.promotions.filter((promotion) => promotion.status === "ended").length}
          foot="in the last 90 days"
        />
        <Kpi
          label="Margin given up"
          value={money(givenUp)}
          foot="across active promotions, at observed volume"
        />
      </div>

      <div className="split section">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>{selected ? selected.name : "Promotions"}</h3>
              <p>
                {selected
                  ? `${selected.kind === "percent" ? `${(selected.value * 100).toFixed(0)}% off` : `${moneyCents(selected.value)} off`} on ${selected.skus.length} SKUs · ${selected.status}`
                  : "Pick a promotion to see its unit economics."}
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">List</th>
                  <th className="num">Promo</th>
                  <th className="num">CM before</th>
                  <th className="num">CM after</th>
                  <th className="num">Needs lift</th>
                  <th className="num">Observed</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {!selected || selected.skus.length === 0 ? (
                  <EmptyRow colSpan={8}>
                    <Tag size={22} style={{ margin: "0 auto var(--s2)", color: "var(--text-faint)" }} aria-hidden="true" />
                    <p>Select a promotion from the list.</p>
                  </EmptyRow>
                ) : (
                  selected.skus.map((sku) => {
                    const row = api.indexed.bySku.get(sku);
                    if (!row) return null;

                    const math = promoMath(row.product, selected.kind, selected.value);
                    const sample = observed.get(sku);
                    const lift =
                      sample && sample.base > 0 ? sample.promo / sample.base - 1 : null;

                    const paying =
                      math.belowCost || lift === null
                        ? false
                        : lift >= math.breakevenLift;

                    return (
                      <tr key={sku}>
                        <td>
                          <button
                            type="button"
                            onClick={() => onOpenSku(sku)}
                            style={{ textAlign: "left", font: "inherit" }}
                          >
                            <span className="strong" style={{ display: "block" }}>
                              {row.product.name}
                            </span>
                            <span className="sku">{sku}</span>
                          </button>
                        </td>
                        <td className="num">{moneyCents(row.product.price)}</td>
                        <td className="num">{moneyCents(math.promoPrice)}</td>
                        <td className="num">{moneyCents(math.baseContribution)}</td>
                        <td className={`num ${math.promoContribution <= 0 ? "down" : ""}`}>
                          {moneyCents(math.promoContribution)}
                        </td>
                        <td className="num strong">
                          {Number.isFinite(math.breakevenLift)
                            ? `+${(math.breakevenLift * 100).toFixed(0)}%`
                            : "∞"}
                        </td>
                        <td className="num">
                          {lift === null ? "—" : `${lift >= 0 ? "+" : ""}${(lift * 100).toFixed(0)}%`}
                        </td>
                        <td>
                          {math.belowCost ? (
                            <span className="badge red">Below cost</span>
                          ) : lift === null ? (
                            <span className="badge">No data</span>
                          ) : paying ? (
                            <span className="badge green">Paying off</span>
                          ) : (
                            <span className="badge amber">Short</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="card-pad-sm">
            <div className="formula">
              break-even lift = <b>CM₀ / CM₁ − 1</b>
              <br />
              where CM₀ is contribution at list and CM₁ contribution at the promoted price
            </div>
            <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-sm)" }}>
              On a 45% contribution margin, 20% off needs roughly 80% more units just to
              stand still. When CM₁ reaches zero the required lift is infinite, which is
              what &quot;below cost&quot; means: no volume recovers it.
            </p>
            <div className="notice info" style={{ marginTop: "var(--s3)" }}>
              <Info size={15} aria-hidden="true" />
              <span>
                Observed lift compares promoted days against this SKU&apos;s own
                non-promoted days, as a daily rate. Seasonality and the reason the SKU was
                chosen for the promotion both leak into that comparison, so treat it as a
                signal rather than a measured causal effect.
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>All promotions</h3>
              <p>Last 90 days.</p>
            </div>
          </div>
          <div>
            {[...api.data.promotions]
              .sort((a, b) => rank(b) - rank(a) || b.startsDaysAgo - a.startsDaysAgo)
              .map((promotion) => (
                <button
                  key={promotion.id}
                  type="button"
                  className="alert"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background:
                      promotion.id === selectedId ? "var(--surface-hover)" : undefined,
                  }}
                  onClick={() => setSelectedId(promotion.id)}
                  aria-pressed={promotion.id === selectedId}
                >
                  <span className="alert-body">
                    <span className="alert-title">{promotion.name}</span>
                    <span className="alert-detail">
                      {promotion.kind === "percent"
                        ? `${(promotion.value * 100).toFixed(0)}% off`
                        : `${moneyCents(promotion.value)} off`}{" "}
                      · {promotion.skus.length} SKUs
                    </span>
                  </span>
                  <span className={`badge ${statusTone(promotion)}`}>{promotion.status}</span>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function rank(promotion: Promotion): number {
  if (promotion.status === "active") return 3;
  if (promotion.status === "scheduled") return 2;
  return 1;
}

function statusTone(promotion: Promotion): string {
  if (promotion.status === "active") return "green";
  if (promotion.status === "scheduled") return "blue";
  return "";
}
