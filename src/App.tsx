"use client";

import { useEffect, useState } from "react";
import { useConsole } from "@/state/useConsole";
import { Sidebar, type View } from "@/components/shell/Sidebar";
import { Overview } from "@/components/overview/Overview";
import { Catalog } from "@/components/catalog/Catalog";
import { ProductDrawer } from "@/components/catalog/ProductDrawer";
import { Inventory } from "@/components/inventory/Inventory";
import { Vendors } from "@/components/vendors/Vendors";
import { Promotions } from "@/components/promotions/Promotions";
import { Ask } from "@/components/assistant/Ask";

export default function App() {
  const api = useConsole();
  const [view, setView] = useState<View>("overview");
  const [openSku, setOpenSku] = useState<string | null>(null);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [view]);

  const row = openSku ? api.indexed.bySku.get(openSku) : undefined;
  const urgent = api.alerts.filter((alert) => alert.severity === "urgent").length;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <Sidebar
        view={view}
        setView={(next) => {
          setOpenSku(null);
          setView(next);
        }}
        urgentCount={urgent}
        skuCount={api.rows.length}
      />

      <main className="main" id="main" tabIndex={-1}>
        {view === "overview" && (
          <Overview api={api} onOpenSku={setOpenSku} onSeeAll={() => setView("catalog")} />
        )}
        {view === "catalog" && <Catalog api={api} onOpenSku={setOpenSku} />}
        {view === "inventory" && <Inventory api={api} onOpenSku={setOpenSku} />}
        {view === "vendors" && <Vendors api={api} />}
        {view === "promotions" && <Promotions api={api} onOpenSku={setOpenSku} />}
        {view === "ask" && <Ask api={api} onOpenSku={setOpenSku} />}
      </main>

      {row && (
        <ProductDrawer
          key={row.product.sku}
          row={row}
          api={api}
          onClose={() => setOpenSku(null)}
        />
      )}
    </div>
  );
}
