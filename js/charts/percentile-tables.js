// The two percentile tables shown on both Modelling and Contingency:
//   - summary: Min, P10, P20 … P90, Max
//   - full distribution: Min, P01, P02 … P99, Max (end of the page)
// One row per level, one or more value columns. Each page supplies the
// columns (Modelling: one per phase; Contingency: modelled cost /
// covered by budget / headroom for the chosen phase).
import { percentileKey } from "../storage/monte-carlo.js";
import { t } from "../i18n/i18n.js";

const range = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

export const SUMMARY_LEVELS = ["min", ...range(10, 90, 10), "max"];
export const FULL_LEVELS = ["min", ...range(1, 99, 1), "max"];

export function levelLabel(level) {
  if (level === "min") return t("dist.min");
  if (level === "max") return t("dist.max");
  return percentileKey(level);
}

// columns: [{ label, cell(level) -> html }]
export function renderPercentileTable(table, levels, columns) {
  if (!table) return;
  table.innerHTML = `
    <thead><tr><th>${t("cont.table.level")}</th>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
    <tbody>
      ${levels
        .map(
          (level) => `<tr class="${level === 50 ? "row-emphasis" : ""}">
        <td><strong>${levelLabel(level)}</strong></td>
        ${columns.map((c) => `<td>${c.cell(level)}</td>`).join("")}
      </tr>`
        )
        .join("")}
    </tbody>
  `;
}
