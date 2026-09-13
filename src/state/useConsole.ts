"use client";

/**
 * The one stateful hook.
 *
 * The generated dataset is immutable. Edits the user makes are held separately
 * and applied on read, so the catalog can be changed and reset without ever
 * mutating the source, and every derived figure recomputes from the same path
 * whether or not anything has been edited.
 *
 * The whole derivation — 240 joins, inventory assessment, vendor scoring and the
 * alert engine — runs in a single memo keyed on the edit map. It takes a few
 * milliseconds, which is cheaper than maintaining an invalidation scheme and
 * removes the class of bug where one screen shows a stale number.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DATA } from "@/lib/generate";
import { index, totals, byCategory } from "@/lib/select";
import { vendorHealth } from "@/lib/vendors";
import { buildAlerts, promoUnits } from "@/lib/alerts";
import type { Dataset, Edit, Product } from "@/lib/types";

const STORAGE_KEY = "merch-console:edits:v1";

export type EditPatch = Partial<Pick<Product, "price" | "status" | "onOrder">>;

export function useConsole() {
  const [patches, setPatches] = useState<Record<string, EditPatch>>({});
  const [log, setLog] = useState<Edit[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount rather than during the initial render: localStorage throws
  // in a private window and is unavailable while the module graph is evaluating.
  useEffect(() => {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          patches?: Record<string, EditPatch>;
          log?: Edit[];
          dismissed?: string[];
        };
        setPatches(parsed.patches ?? {});
        setLog(parsed.log ?? []);
        setDismissed(parsed.dismissed ?? []);
      }
    } catch {
      // Unreadable or corrupt. Starting clean beats failing to render.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ patches, log, dismissed }),
      );
    } catch {
      // Quota or blocked storage. Losing persistence is acceptable here.
    }
  }, [patches, log, dismissed, hydrated]);

  const data: Dataset = useMemo(() => {
    if (Object.keys(patches).length === 0) return DATA;
    return {
      ...DATA,
      products: DATA.products.map((product) =>
        patches[product.sku] ? { ...product, ...patches[product.sku] } : product,
      ),
    };
  }, [patches]);

  const derived = useMemo(() => {
    const indexed = index(data);
    const health = data.vendors.map((vendor) =>
      vendorHealth(vendor, data.receipts, data.products, indexed.revenueBySku),
    );
    const alerts = buildAlerts({
      rows: indexed.rows,
      vendorHealth: health,
      promotions: data.promotions,
      promoUnits: promoUnits(indexed.rows, data.promotions, indexed.salesBySku),
    });

    return {
      indexed,
      health,
      alerts,
      totals: totals(indexed.rows),
      categories: byCategory(indexed.rows),
    };
  }, [data]);

  const visibleAlerts = useMemo(
    () => derived.alerts.filter((alert) => !dismissed.includes(alert.id)),
    [derived.alerts, dismissed],
  );

  const edit = useCallback(
    (sku: string, patch: EditPatch) => {
      const product = DATA.products.find((candidate) => candidate.sku === sku);
      if (!product) return;

      const entries = Object.entries(patch) as [keyof EditPatch, string | number][];
      setLog((current) => [
        ...entries.map(([field, to]) => ({
          sku,
          field,
          from: product[field],
          to,
          at: new Date().toISOString(),
        })),
        ...current,
      ].slice(0, 200));

      setPatches((current) => ({ ...current, [sku]: { ...current[sku], ...patch } }));
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const reset = useCallback(() => {
    setPatches({});
    setLog([]);
    setDismissed([]);
  }, []);

  return {
    data,
    hydrated,
    rows: derived.indexed.rows,
    indexed: derived.indexed,
    health: derived.health,
    alerts: visibleAlerts,
    allAlerts: derived.alerts,
    totals: derived.totals,
    categories: derived.categories,
    log,
    editCount: Object.keys(patches).length,
    edit,
    dismiss,
    reset,
  };
}

export type ConsoleApi = ReturnType<typeof useConsole>;
