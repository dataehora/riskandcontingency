// 5x5 Risk Assessment Matrix renderer, shared by Configuration (empty
// preview of the configured bins) and Risk Reporting (with risks placed
// in their cells). Likelihood runs bottom-to-top, Cost Impact
// left-to-right; cell tint = L x I severity band (see ram.js).
import { BIN_COUNT, likelihoodLabel, costLabel, cellSeverity } from "../storage/ram.js";
import { t, tn, tv, locale, fmtInt } from "../i18n/i18n.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function fmtCompact(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(locale(), { notation: "compact", maximumFractionDigits: 1 });
}

function fmtPct(n) {
  return `${Number(n.toFixed(1)).toLocaleString(locale())}%`;
}

function chipHtml(point) {
  const { record, likelihood, cost } = point;
  const kind = record.riskType === "Opportunity" ? "opportunity" : "threat";
  const tip = `${record.id} — ${record.title}\n${tv("riskType", record.riskType)} · ${tv("recordType", record.recordType)} · ${tv("status", record.status)}\n${t("ram.chipTip", { likelihood: fmtPct(likelihood), cost: fmtInt(cost) })}`;
  return `<span class="ram-chip ram-chip-${kind}" title="${escapeHtml(tip)}">${escapeHtml(record.id)}</span>`;
}

// edges: { likelihood: [6 numbers], cost: [6 numbers] }. points
// optional — omitted for the configuration preview.
export function renderRiskMatrix(container, edges, points = null) {
  const cells = Array.from({ length: BIN_COUNT }, () => Array.from({ length: BIN_COUNT }, () => []));
  for (const p of points ?? []) cells[p.row][p.col].push(p);

  const rows = [];
  for (let row = BIN_COUNT - 1; row >= 0; row--) {
    const lo = edges.likelihood[row];
    const hi = edges.likelihood[row + 1];
    rows.push(`
      <div class="ram-axis-label ram-axis-label-y">
        <strong>${likelihoodLabel(row)}</strong>
        <span>${fmtPct(lo)}–${fmtPct(hi)}</span>
      </div>
    `);
    for (let col = 0; col < BIN_COUNT; col++) {
      const items = cells[row][col];
      const count = items.length;
      rows.push(`
        <div class="ram-cell ram-cell-${cellSeverity(row, col)}" aria-label="${escapeHtml(tn("ram.cellAria", count, { likelihood: likelihoodLabel(row), cost: costLabel(col) }))}">
          ${points ? items.map(chipHtml).join("") : ""}
        </div>
      `);
    }
  }

  const xLabels = Array.from({ length: BIN_COUNT }, (_, col) => costLabel(col)).map(
    (label, col) => `
      <div class="ram-axis-label ram-axis-label-x">
        <strong>${label}</strong>
        <span>${fmtCompact(edges.cost[col])}–${fmtCompact(edges.cost[col + 1])}</span>
      </div>
    `
  ).join("");

  container.innerHTML = `
    <div class="ram-scroll">
      <div class="ram-frame">
        <div class="ram-y-title">${t("ram.axis.likelihood")}</div>
        <div class="ram-grid">
          ${rows.join("")}
          <div></div>
          ${xLabels}
        </div>
        <div></div>
        <div class="ram-x-title">${t("ram.axis.cost")}</div>
      </div>
    </div>
  `;
}
