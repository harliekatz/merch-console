"use client";

/**
 * The question box.
 *
 * Pattern matching against a fixed set of merchandising questions. The screen
 * says so, shows the parsed query above the results, and lists what it can
 * answer when a question does not match.
 *
 * Showing the query is what makes a result checkable, since the reader can see
 * the filters and sort that produced it.
 */
import { useState } from "react";
import { CornerDownLeft, Search, Sparkles } from "lucide-react";
import { EXAMPLES, ask, type Answer } from "@/lib/ask";
import { DATA } from "@/lib/generate";
import { money, percent, days as formatDays } from "@/lib/format";
import { EmptyRow, StatePill } from "@/components/ui/primitives";
import type { ConsoleApi } from "@/state/useConsole";

export function Ask({
  api,
  onOpenSku,
}: {
  api: ConsoleApi;
  onOpenSku: (sku: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);

  const submit = (text: string) => {
    setQuestion(text);
    setAnswer(ask(text, api.rows));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ask</h1>
          <p>
            Type a merchandising question and this runs it against the joined catalog.
            It matches your question against a fixed set of query shapes and shows you
            the query it ran. There is no language model involved.
          </p>
        </div>
      </div>

      <form
        className="ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) submit(question);
        }}
      >
        <label className="search" style={{ flex: 1, maxWidth: "none" }}>
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Your question</span>
          <input
            className="input"
            style={{ minHeight: 40 }}
            placeholder="What should I reorder this week?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <button type="submit" className="button primary" disabled={!question.trim()}>
          <CornerDownLeft size={14} aria-hidden="true" />
          Run
        </button>
      </form>

      <div className="row" style={{ marginTop: "var(--s3)" }}>
        <span className="muted" style={{ fontSize: "var(--text-sm)" }}>Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="chip"
            onClick={() => submit(example)}
          >
            {example}
          </button>
        ))}
      </div>

      {answer && (
        <div className="section stack">
          {answer.query ? (
            <>
              <dl className="ask-query">
                <div>
                  <dt>Metric</dt>
                  <dd>{answer.query.label}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>
                    {answer.query.categoryId
                      ? DATA.categories.find((c) => c.id === answer.query?.categoryId)?.name
                      : "All"}
                  </dd>
                </div>
                <div>
                  <dt>Vendor</dt>
                  <dd>
                    {answer.query.vendorId
                      ? DATA.vendors.find((v) => v.id === answer.query?.vendorId)?.name
                      : "All"}
                  </dd>
                </div>
                {answer.query.marginBelow !== null && (
                  <div>
                    <dt>Threshold</dt>
                    <dd>below {percent(answer.query.marginBelow)}</dd>
                  </div>
                )}
                <div>
                  <dt>Sort</dt>
                  <dd>{answer.query.sortLabel}</dd>
                </div>
                <div>
                  <dt>Limit</dt>
                  <dd>{answer.query.limit}</dd>
                </div>
              </dl>

              <div className="notice good">
                <Sparkles size={15} aria-hidden="true" />
                <span>{answer.summary}</span>
              </div>

              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Vendor</th>
                        <th className="num">Margin</th>
                        <th className="num">28d units</th>
                        <th className="num">28d revenue</th>
                        <th className="num">On hand</th>
                        <th className="num">Cover</th>
                        <th className="num">Order</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {answer.rows.length === 0 ? (
                        <EmptyRow colSpan={9}>
                          <p>That query matched no products.</p>
                        </EmptyRow>
                      ) : (
                        answer.rows.map((row) => (
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
                            <td className={`num ${row.economics.marginRate < 0.15 ? "down" : ""}`}>
                              {percent(row.economics.marginRate)}
                            </td>
                            <td className="num">{row.units28}</td>
                            <td className="num strong">{money(row.revenue28)}</td>
                            <td className="num">{row.product.onHand}</td>
                            <td className="num">{formatDays(row.inventory.daysOfCover)}</td>
                            <td className="num">
                              {row.inventory.suggestedOrder > 0
                                ? row.inventory.suggestedOrder
                                : "—"}
                            </td>
                            <td><StatePill state={row.inventory.state} /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card card-pad">
              <h3 style={{ marginBottom: "var(--s2)" }}>No matching query</h3>
              <p style={{ fontSize: "var(--text-sm)" }}>{answer.summary}</p>
              <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-sm)" }}>
                Nothing was run, so nothing is shown. These are the query shapes it can
                answer.
              </p>
              <div className="row" style={{ marginTop: "var(--s3)" }}>
                {(answer.unmatched ?? EXAMPLES).map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chip"
                    onClick={() => submit(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!answer && (
        <div className="card card-pad section">
          <h3 style={{ marginBottom: "var(--s2)" }}>What this can answer</h3>
          <p style={{ fontSize: "var(--text-sm)" }}>
            Eight query shapes — replenishment, overstock, margin thresholds, top sellers,
            cost increases, catalog hygiene, active promotions and slow movers — each of
            which accepts a category, a vendor, a percentage threshold and a row limit
            parsed out of the question.
          </p>
          <p style={{ marginTop: "var(--s3)", fontSize: "var(--text-sm)" }}>
            A production version could put a language model in front of this to widen
            what it understands. The layer underneath would stay the same. The model
            would pick the query, and the query would still be shown.
          </p>
        </div>
      )}
    </div>
  );
}
