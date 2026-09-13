"use client";

import {
  Boxes,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Tags,
  Truck,
} from "lucide-react";

export type View =
  | "overview"
  | "catalog"
  | "inventory"
  | "vendors"
  | "promotions"
  | "ask";

const NAV: { id: View; label: string; icon: typeof Package }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "catalog", label: "Catalog", icon: Package },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "vendors", label: "Vendors", icon: Truck },
  { id: "promotions", label: "Promotions", icon: Tags },
  { id: "ask", label: "Ask", icon: MessageSquareText },
];

export function Sidebar({
  view,
  setView,
  urgentCount,
  skuCount,
}: {
  view: View;
  setView: (view: View) => void;
  urgentCount: number;
  skuCount: number;
}) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Boxes size={15} />
        </span>
        <span className="brand-text">
          <span className="brand-name">Merch Console</span>
          <span className="brand-tag">{skuCount} SKUs · demo data</span>
        </span>
      </div>

      <div className="nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${view === id ? "active" : ""}`}
            aria-current={view === id ? "page" : undefined}
            // The count is announced as part of the button rather than as a
            // separate label on the badge, so a screen reader hears "Overview,
            // 5 urgent alerts" instead of two adjacent unrelated strings.
            aria-label={
              id === "overview" && urgentCount > 0
                ? `${label}, ${urgentCount} urgent alert${urgentCount === 1 ? "" : "s"}`
                : undefined
            }
            onClick={() => setView(id)}
          >
            <Icon aria-hidden="true" />
            {label}
            {id === "overview" && urgentCount > 0 && (
              <span className="nav-count" aria-hidden="true">
                {urgentCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="sidebar-foot">
        Portfolio project. Synthetic catalog, no backend, nothing leaves your browser.
      </p>
    </nav>
  );
}
