"use client";

/**
 * Vendor scorecards.
 *
 * The composite is always shown open. A supplier score that cannot be opened up
 * is a number nobody will act on, because the first question in any vendor
 * conversation is "what specifically".
 */
import { RotateCcw } from "lucide-react";
import { count, money, percent } from "@/lib/format";
import { Kpi, Meter } from "@/components/ui/primitives";
import type { VendorHealth } from "@/lib/vendors";
import type { ConsoleApi } from "@/state/useConsole";

export function Vendors({ api }: { api: ConsoleApi }) {
  const ranked = [...api.health].sort((a, b) => a.score - b.score);
  const worst = ranked[0];
  const mean =
    api.health.reduce((sum, entry) => sum + entry.score, 0) / Math.max(1, api.health.length);

  const lateVendors = api.health.filter(
    (entry) => entry.actualLeadDays > entry.vendor.quotedLeadDays + 2,
  ).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Vendors</h1>
          <p>
            One health score per vendor, computed from purchase-order receipts and cost
            movement. Every component is measured, none is typed in.
          </p>
        </div>
        {api.editCount > 0 && (
          <button type="button" className="button" onClick={api.reset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset {api.editCount} edited SKU{api.editCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="grid-4">
        <Kpi label="Vendors" value={api.health.length} foot={`${count(api.rows.length)} SKUs sourced`} />
        <Kpi label="Mean health" value={mean.toFixed(0)} foot="weighted composite, 0-100" />
        <Kpi
          label="Running late"
          value={lateVendors}
          foot="averaging past their quoted lead time"
        />
        <Kpi
          label="Lowest score"
          value={worst ? worst.score.toFixed(0) : "—"}
          foot={worst?.vendor.name}
        />
      </div>

      <div className="stack section">
        {ranked.map((entry) => (
          <VendorCard key={entry.vendor.id} entry={entry} />
        ))}
      </div>

      <div className="card card-pad section">
        <h3 style={{ marginBottom: "var(--s2)" }}>How the score is built</h3>
        <div className="formula">
          score = 0.28·fill rate + 0.26·on time + 0.18·consistency + 0.16·quality +
          0.12·cost trend
        </div>
        <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-sm)" }}>
          Consistency is lead-time variability, inverted. It carries real weight because a
          vendor who is reliably slow can be planned around, while one who is erratic
          cannot — and erratic lead times are paid for directly in safety stock, which is
          the σ·√L term on the inventory screen. Quality is scored against a 5% rejection
          floor rather than against 100%, so a vendor returning one box in eight does not
          quietly score in the eighties.
        </p>
      </div>
    </div>
  );
}

function VendorCard({ entry }: { entry: VendorHealth }) {
  const late = entry.actualLeadDays > entry.vendor.quotedLeadDays + 2;
  const weakest = [...entry.components].sort((a, b) => a.score - b.score)[0];

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: "var(--s3)", flexWrap: "nowrap" }}>
          <span className={`score-ring ${entry.grade.toLowerCase()}`} aria-hidden="true">
            {entry.score.toFixed(0)}
          </span>
          <div>
            <h3>{entry.vendor.name}</h3>
            <p style={{ fontSize: "var(--text-sm)" }}>
              {entry.vendor.country} · {entry.skuCount} SKUs · MOQ {entry.vendor.moq} ·{" "}
              {entry.vendor.termsDays}-day terms
            </p>
          </div>
        </div>
        <div className="row" style={{ gap: "var(--s2)" }}>
          <span className={`badge ${gradeTone(entry.grade)}`}>Grade {entry.grade}</span>
          <span className={`badge ${late ? "red" : "green"}`}>
            {entry.actualLeadDays.toFixed(0)}d actual vs {entry.vendor.quotedLeadDays}d quoted
          </span>
        </div>
      </div>

      <div className="card-pad-sm">
        <div className="grid-2">
          <div>
            {entry.components.map((component) => (
              <div className="component" key={component.key}>
                <span style={{ color: "var(--text)" }}>{component.label}</span>
                <Meter value={component.score / 100} tone="auto" />
                <span className="num tabular" style={{ textAlign: "right" }}>
                  {component.score.toFixed(0)}
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {" "}×{component.weight.toFixed(2)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <dl>
            <div className="kv">
              <dt>Receipts analyzed</dt>
              <dd>{entry.receiptCount}</dd>
            </div>
            <div className="kv">
              <dt>Lead-time variance</dt>
              <dd>±{entry.leadVariance.toFixed(1)} days</dd>
            </div>
            <div className="kv">
              <dt>Fill rate</dt>
              <dd>{percent(entry.components.find((c) => c.key === "fillRate")?.value ?? 0, 1)}</dd>
            </div>
            <div className="kv">
              <dt>Rejected on inspection</dt>
              <dd>{percent(entry.components.find((c) => c.key === "quality")?.value ?? 0, 1)}</dd>
            </div>
            <div className="kv">
              <dt>Cost movement, 12 weeks</dt>
              <dd className={(entry.components.find((c) => c.key === "costTrend")?.value ?? 0) > 0.05 ? "down" : ""}>
                {percent(entry.components.find((c) => c.key === "costTrend")?.value ?? 0, 1)}
              </dd>
            </div>
            <div className="kv">
              <dt>28-day contribution</dt>
              <dd>{money(entry.contribution)}</dd>
            </div>
          </dl>
        </div>

        {weakest && (
          <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-xs)" }}>
            Weakest component:{" "}
            <strong style={{ color: "var(--text-secondary)" }}>
              {weakest.label.toLowerCase()}
            </strong>{" "}
            at {weakest.score.toFixed(0)}. {weakest.hint}.
          </p>
        )}
      </div>
    </section>
  );
}

function gradeTone(grade: VendorHealth["grade"]): string {
  if (grade === "A") return "green";
  if (grade === "B") return "blue";
  if (grade === "C") return "amber";
  return "red";
}
