import { getRegisterState, onRegisterChange } from "../storage/register-store.js";
import { RECORD_TYPES } from "../storage/workbook.js";
import {
  parseRamConfig,
  resolveBins,
  riskPoints,
  cellSeverity,
  LIKELIHOOD_LABELS,
  COST_LABELS,
} from "../storage/ram.js";
import { renderRiskMatrix } from "../charts/risk-matrix.js";

const ALL = "__all__";
const filters = { phase: "pre", impactArea: ALL, recordType: ALL };
let currentState = getRegisterState();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function fillSelect(select, values, allLabel) {
  const wanted = values.includes(filters[select.dataset.ramFilter]) ? filters[select.dataset.ramFilter] : ALL;
  select.innerHTML =
    `<option value="${ALL}">${allLabel}</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  select.value = wanted;
  filters[select.dataset.ramFilter] = wanted;
}

function renderFilters() {
  const impactAreas = [
    ...new Set([...currentState.impactAreas.map((i) => i.name), ...currentState.riskRecords.map((r) => r.impactArea).filter(Boolean)]),
  ];
  const ia = document.querySelector('[data-ram-filter="impactArea"]');
  const rt = document.querySelector('[data-ram-filter="recordType"]');
  if (ia) fillSelect(ia, impactAreas, "All impact areas");
  if (rt) fillSelect(rt, RECORD_TYPES, "All record types");
  const phase = document.querySelector('[data-ram-filter="phase"]');
  if (phase) phase.value = filters.phase;
}

function filteredRecords() {
  return currentState.riskRecords.filter(
    (r) =>
      (filters.impactArea === ALL || r.impactArea === filters.impactArea) &&
      (filters.recordType === ALL || r.recordType === filters.recordType)
  );
}

const SEVERITY_BADGE = { low: "badge-low", medium: "badge-medium", high: "badge-high" };

function render() {
  const matrixEl = document.querySelector("[data-ram-matrix]");
  if (!matrixEl || currentState.status !== "ready") return;

  // Bins are resolved against the *whole* register, not the filtered
  // subset, so the Cost Impact span matches Configuration and cells
  // don't shift meaning as filters change.
  const bins = resolveBins(parseRamConfig(currentState.settings), currentState.riskRecords);
  const records = filteredRecords();
  const { points, unplotted } = riskPoints(records, filters.phase, bins);
  renderRiskMatrix(matrixEl, bins, points);

  const phaseLabel = filters.phase === "pre" ? "pre-mitigation" : "post-mitigation";
  document.querySelector("[data-ram-summary]").textContent =
    `${points.length} risk${points.length === 1 ? "" : "s"} plotted (${phaseLabel}) · ${records.length} of ${currentState.riskRecords.length} match the filters` +
    (unplotted.length ? ` · ${unplotted.length} matching risk${unplotted.length === 1 ? " has" : "s have"} no ${phaseLabel} Likelihood/Direct Cost assessed and ${unplotted.length === 1 ? "isn't" : "aren't"} shown` : "") +
    (bins.costOutOfRange ? " · Cost Impact bins need adjusting in Configuration" : "");

  const table = document.querySelector("[data-ram-table]");
  const sorted = [...points].sort((a, b) => b.row * 5 + b.col - (a.row * 5 + a.col) || Math.abs(b.cost) - Math.abs(a.cost));
  table.innerHTML = sorted.length
    ? `
    <thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Record Type</th><th>Impact Area</th><th>Likelihood</th><th>Cost Impact</th><th>Cell</th></tr></thead>
    <tbody>${sorted
      .map((p) => {
        const sev = cellSeverity(p.row, p.col);
        return `<tr>
          <td>${escapeHtml(p.record.id)}</td>
          <td>${escapeHtml(p.record.title)}</td>
          <td><span class="badge ${p.record.riskType === "Threat" ? "badge-high" : "badge-low"}">${escapeHtml(p.record.riskType)}</span></td>
          <td>${escapeHtml(p.record.recordType)}</td>
          <td>${escapeHtml(p.record.impactArea)}</td>
          <td>${Number(p.likelihood.toFixed(1))}% · ${LIKELIHOOD_LABELS[p.row]}</td>
          <td>${p.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${COST_LABELS[p.col]}</td>
          <td><span class="badge ${SEVERITY_BADGE[sev]}">${sev[0].toUpperCase() + sev.slice(1)} (${(p.row + 1) * (p.col + 1)})</span></td>
        </tr>`;
      })
      .join("")}</tbody>`
    : "";
}

function wire() {
  document.querySelectorAll("[data-ram-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      filters[select.dataset.ramFilter] = select.value;
      render();
    });
  });
}

onRegisterChange((state) => {
  currentState = state;
  if (state.status !== "ready") return;
  renderFilters();
  render();
});
wire();
