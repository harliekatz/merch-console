/** Shared pieces. Anything used on more than one screen lives here. */
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { signedPercent } from "@/lib/format";
import type { InventoryView } from "@/lib/inventory";

export function Kpi({
  label,
  value,
  foot,
  change,
  icon,
  children,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  /** When given, renders a signed change with an arrow and colour. */
  change?: number;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        {icon}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {(foot !== undefined || change !== undefined) && (
        <div className="kpi-foot">
          {change !== undefined && (
            <span className={change >= 0 ? "up" : "down"} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
              {change >= 0 ? (
                <TrendingUp size={13} aria-hidden="true" />
              ) : (
                <TrendingDown size={13} aria-hidden="true" />
              )}
              {signedPercent(change)}
            </span>
          )}
          {foot}
        </div>
      )}
      {children && <div className="kpi-spark">{children}</div>}
    </div>
  );
}

export function Meter({
  value,
  tone,
}: {
  value: number;
  tone?: "green" | "red" | "amber" | "blue" | "auto";
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const variant =
    tone === undefined || tone === "green"
      ? ""
      : tone === "auto"
        ? clamped < 0.4
          ? " red"
          : clamped < 0.7
            ? " amber"
            : ""
        : ` ${tone}`;

  return (
    <div className="meter">
      <div className={`meter-fill${variant}`} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

const STATE_LABEL: Record<InventoryView["state"], string> = {
  stockout: "Out of stock",
  "at-risk": "At risk",
  reorder: "Reorder",
  healthy: "Healthy",
  overstock: "Overstocked",
  dormant: "Dormant",
};

export function StatePill({ state }: { state: InventoryView["state"] }) {
  return <span className={`state ${state}`}>{STATE_LABEL[state]}</span>;
}

/**
 * A line chart of one or two series, drawn inline.
 *
 * Series are plotted on a shared scale so the comparison is honest; giving the
 * prior period its own axis would make any two periods look similar.
 */
export function LineChart({
  series,
  height = 220,
  labels,
}: {
  series: { values: number[]; color: string; dashed?: boolean; label: string }[];
  height?: number;
  labels?: string[];
}) {
  const width = 720;
  const padTop = 10;
  const padBottom = labels ? 22 : 8;
  const all = series.flatMap((entry) => entry.values);
  if (all.length === 0) return null;

  const max = Math.max(...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const plotHeight = height - padTop - padBottom;

  const toPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = padTop + plotHeight - ((value - min) / span) * plotHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={series
        .map(
          (entry) =>
            `${entry.label}: ${Math.round(entry.values[entry.values.length - 1] ?? 0)} at the latest point`,
        )
        .join("; ")}
    >
      <g className="chart-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={width}
            y1={padTop + plotHeight * fraction}
            y2={padTop + plotHeight * fraction}
          />
        ))}
      </g>
      {series.map((entry) => (
        <polyline
          key={entry.label}
          points={toPath(entry.values)}
          fill="none"
          stroke={entry.color}
          strokeWidth={entry.dashed ? 1.4 : 2}
          strokeDasharray={entry.dashed ? "4 4" : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function Sparkline({ values, color }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color ?? "var(--green-500)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "var(--s7)", textAlign: "center" }}>
        {children}
      </td>
    </tr>
  );
}
