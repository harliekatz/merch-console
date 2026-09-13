"use client";

/**
 * The catalog table.
 *
 * Filtering and sorting run over the joined rows in memory. At 240 rows this is
 * instant without virtualization. At 50,000 it would need it, which the
 * limitations document covers.
 *
 * Export writes the filtered view rather than the whole catalog, so what lands
 * in the file matches what is on screen.
 */
import { useMemo, useState } from "react";
import { ArrowUpDown, Download, Filter, Search, X } from "lucide-react";
import { money, moneyCents, percent, probabilityValue, days as formatDays } from "@/lib/format";
import { EmptyRow, StatePill } from "@/components/ui/primitives";
import type { Row } from "@/lib/select";
import type { ConsoleApi } from "@/state/useConsole";

type SortKey =
  | "name"
  | "revenue"
  | "units"
  | "margin"
  | "onHand"
  | "cover"
  | "risk"
  | "price";

const COLUMNS: { key: SortKey | null; label: string; num?: boolean }[] = [
  { key: "name", label: "Product" },
  { key: null, label: "Vendor" },
  { key: null, label: "Status" },
  { key: "price", label: "Price", num: true },
  { key: "margin", label: "Margin", num: true },
  { key: "units", label: "28d units", num: true },
  { key: "revenue", label: "28d revenue", num: true },
  { key: "onHand", label: "On hand", num: true },
  { key: "cover", label: "Cover", num: true },
  { key: null, label: "State" },
];

export function Catalog({
  api,
  onOpenSku,
}: {
  api: ConsoleApi;
  onOpenSku: (sku: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [state, setState] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("revenue");
  const [descending, setDescending] = useState(true);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = api.rows.filter((row) => {
      if (categoryId && row.category.id !== categoryId) return false;
      if (vendorId && row.vendor.id !== vendorId) return false;
      if (state && row.inventory.state !== state) return false;
      if (liveOnly && row.product.status !== "live") return false;
      if (!query) return true;
      return (
        row.product.name.toLowerCase().includes(query) ||
        row.product.sku.toLowerCase().includes(query) ||
        row.vendor.name.toLowerCase().includes(query)
      );
    });

    const value = (row: Row): number | string => {
      switch (sort) {
        case "name": return row.product.name;
        case "revenue": return row.revenue28;
        case "units": return row.units28;
        case "margin": return row.economics.marginRate;
        case "onHand": return row.product.onHand;
        // Infinite cover sorts consistently instead of landing wherever the
        // comparator happens to put it.
        case "cover": return Number.isFinite(row.inventory.daysOfCover)
          ? row.inventory.daysOfCover
          : 1e9;
        case "risk": return row.inventory.stockoutRisk;
        case "price": return row.product.price;
        default: return 0;
      }
    };

    return rows.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const compared =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : (left as number) - (right as number);
      return descending ? -compared : compared;
    });
  }, [api.rows, search, categoryId, vendorId, state, liveOnly, sort, descending]);

  const totalRevenue = filtered.reduce((sum, row) => sum + row.revenue28, 0);
  const hasFilters = Boolean(search || categoryId || vendorId || state || liveOnly);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDescending((current) => !current);
    else {
      setSort(key);
      setDescending(key !== "name");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Catalog</h1>
          <p>
            Every SKU with its vendor, unit economics, stock position and trailing
            performance on one row. Click a product for the full record.
          </p>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
        >
          <Download size={14} aria-hidden="true" />
          Export {filtered.length} rows
        </button>
      </div>

      <div className="card">
        <div className="toolbar">
          <label className="search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Search products, SKUs and vendors</span>
            <input
              type="search"
              className="input"
              placeholder="Search SKU, product or vendor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="sr-only" htmlFor="filter-category">Category</label>
          <select
            id="filter-category"
            className="input"
            style={{ width: "auto", minWidth: 140 }}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">All categories</option>
            {api.data.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>

          <label className="sr-only" htmlFor="filter-vendor">Vendor</label>
          <select
            id="filter-vendor"
            className="input"
            style={{ width: "auto", minWidth: 150 }}
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="">All vendors</option>
            {api.data.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>

          <label className="sr-only" htmlFor="filter-state">Stock state</label>
          <select
            id="filter-state"
            className="input"
            style={{ width: "auto", minWidth: 130 }}
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">Any stock state</option>
            <option value="stockout">Out of stock</option>
            <option value="at-risk">At risk</option>
            <option value="reorder">Reorder</option>
            <option value="healthy">Healthy</option>
            <option value="overstock">Overstocked</option>
            <option value="dormant">Dormant</option>
          </select>

          <button
            type="button"
            className={`chip ${liveOnly ? "on" : ""}`}
            aria-pressed={liveOnly}
            onClick={() => setLiveOnly((current) => !current)}
          >
            <Filter size={12} aria-hidden="true" />
            Live only
          </button>

          {hasFilters && (
            <button
              type="button"
              className="button ghost small"
              onClick={() => {
                setSearch("");
                setCategoryId("");
                setVendorId("");
                setState("");
                setLiveOnly(false);
              }}
            >
              <X size={13} aria-hidden="true" />
              Clear
            </button>
          )}

          <span className="row-end muted" style={{ fontSize: "var(--text-sm)" }}>
            {filtered.length} of {api.rows.length} SKUs · {money(totalRevenue)}
          </span>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.label}
                    className={`${column.num ? "num" : ""} ${column.key ? "sortable" : ""}`}
                    aria-sort={
                      column.key && sort === column.key
                        ? descending ? "descending" : "ascending"
                        : undefined
                    }
                  >
                    {column.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key as SortKey)}
                        style={{
                          font: "inherit",
                          color: "inherit",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {column.label}
                        {sort === column.key && <ArrowUpDown size={11} aria-hidden="true" />}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={COLUMNS.length}>
                  <p>No SKUs match these filters.</p>
                </EmptyRow>
              ) : (
                filtered.map((row) => (
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
                    <td>
                      <span className={`badge ${row.product.status === "live" ? "green" : ""}`}>
                        {row.product.status}
                      </span>
                    </td>
                    <td className="num">{moneyCents(row.product.price)}</td>
                    <td className={`num ${row.economics.marginRate < 0.15 ? "down" : ""}`}>
                      {percent(row.economics.marginRate)}
                    </td>
                    <td className="num">{row.units28}</td>
                    <td className="num strong">{money(row.revenue28)}</td>
                    <td className="num">{row.product.onHand}</td>
                    <td className="num">{formatDays(row.inventory.daysOfCover)}</td>
                    <td><StatePill state={row.inventory.state} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * CSV of the filtered view.
 *
 * Fields are quoted and internal quotes doubled, per RFC 4180. Product names in
 * a real catalog contain commas, quotes and the occasional newline, and a naive
 * join produces a file that opens misaligned in Excel.
 */
function exportCsv(rows: Row[]): void {
  const header = [
    "SKU", "Product", "Category", "Vendor", "Status", "Price", "Unit cost",
    "Fulfillment", "Contribution", "Margin %", "28d units", "28d revenue",
    "On hand", "On order", "Days of cover", "Stockout risk %", "State",
  ];

  const body = rows.map((row) => [
    row.product.sku,
    row.product.name,
    row.category.name,
    row.vendor.name,
    row.product.status,
    row.product.price.toFixed(2),
    row.product.unitCost.toFixed(2),
    row.product.fulfilmentCost.toFixed(2),
    row.economics.contribution.toFixed(2),
    (row.economics.marginRate * 100).toFixed(1),
    String(row.units28),
    row.revenue28.toFixed(2),
    String(row.product.onHand),
    String(row.product.onOrder),
    Number.isFinite(row.inventory.daysOfCover)
      ? row.inventory.daysOfCover.toFixed(0)
      : "",
    probabilityValue(row.inventory.stockoutRisk),
    row.inventory.state,
  ]);

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((line) => line.map(escape).join(",")).join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `catalog-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
