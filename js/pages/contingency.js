import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import { PERCENTILE_STEPS } from "../storage/monte-carlo.js";
import { renderSCurve } from "../charts/s-curve.js";

const PHASE_LABEL = { pre: "Pre-mitigation", post: "Post-mitigation" };

let currentState = getRegisterState();
let budgetInputWired = false;
let comparePhaseWired = false;
let comparePhase = null; // user's chosen phase when a run has both

function fmtNumber(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function parseLastRun(settings) {
  if (!settings?.lastModelledResultsJson) return null;
  try {
    return JSON.parse(settings.lastModelledResultsJson);
  } catch {
    return null;
  }
}

// Highest of the computed percentiles (P05-P50) the budget covers. We
// only have percentiles up to P50 (per the user's spec), so anything
// above the modelled median just reports "covers the full modelled
// range" rather than a specific higher percentile we don't have.
function confidenceLabel(summary, budget) {
  if (!Number.isFinite(budget)) return "—";
  if (budget < summary.min) return "Below modelled minimum";
  if (budget >= summary.max) return "Covers full modelled range";
  let covered = null;
  for (const p of PERCENTILE_STEPS) {
    const key = `P${String(p).padStart(2, "0")}`;
    if (summary.percentiles[key] <= budget) covered = p;
  }
  return covered === null ? "Below P05" : `Up to P${String(covered).padStart(2, "0")}`;
}

function resolveComparePhase(lastRun) {
  const available = lastRun.phases ?? [];
  if (comparePhase && available.includes(comparePhase)) return comparePhase;
  // Default to post-mitigation (residual risk) when both are available.
  return available.includes("post") ? "post" : available[0];
}

function renderPhaseSelector(lastRun) {
  const wrap = document.querySelector("[data-contingency-phase-select-wrap]");
  const select = document.querySelector("[data-contingency-phase-select]");
  if (!wrap || !select) return;
  const available = lastRun.phases ?? [];
  if (available.length < 2) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  select.innerHTML = available.map((p) => `<option value="${p}">${PHASE_LABEL[p]}</option>`).join("");
  select.value = resolveComparePhase(lastRun);
}

function renderResults() {
  const settings = currentState.settings ?? {};
  const budget = Number(settings.availableBudget);
  const lastRun = parseLastRun(settings);
  const resultsEl = document.querySelector("[data-contingency-results]");
  const noBudgetEl = document.querySelector("[data-contingency-no-budget]");

  const hasBudget = Number.isFinite(budget) && settings.availableBudget !== "" && settings.availableBudget != null;
  if (!lastRun || !hasBudget) {
    if (resultsEl) resultsEl.hidden = true;
    if (noBudgetEl) noBudgetEl.hidden = false;
    return;
  }
  if (resultsEl) resultsEl.hidden = false;
  if (noBudgetEl) noBudgetEl.hidden = true;

  renderPhaseSelector(lastRun);
  const phase = resolveComparePhase(lastRun);
  const { summary, curve } = lastRun.results[phase];
  const p50 = summary.percentiles.P50 ?? summary.min;

  document.querySelector("[data-contingency-run-meta]").textContent =
    `Compared against ${settings.lastModelledTrials?.toLocaleString() ?? "—"} trials · ${PHASE_LABEL[phase]} · modelled ${settings.lastModelledAt ? new Date(settings.lastModelledAt).toLocaleString() : "—"}`;
  document.querySelector("[data-contingency-budget]").textContent = fmtNumber(budget);
  document.querySelector("[data-contingency-confidence]").textContent = confidenceLabel(summary, budget);
  document.querySelector("[data-contingency-headroom]").textContent = fmtNumber(budget - p50);

  renderSCurve(document.querySelector("[data-contingency-chart]"), curve ?? [], summary, {
    referenceLine: { value: budget, label: "Available Budget" },
  });

  const cols = ["Min", ...PERCENTILE_STEPS.map((p) => `P${String(p).padStart(2, "0")}`), "Max"];
  const costs = [
    summary.min,
    ...PERCENTILE_STEPS.map((p) => summary.percentiles[`P${String(p).padStart(2, "0")}`]),
    summary.max,
  ];
  const table = document.querySelector("[data-contingency-table]");
  table.innerHTML = `
    <thead><tr><th></th>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>
      <tr><td>Modelled cost</td>${costs.map((v) => `<td>${fmtNumber(v)}</td>`).join("")}</tr>
      <tr><td>Covered by budget?</td>${costs
        .map((v) => `<td>${budget >= v ? '<span class="badge badge-low">Yes</span>' : '<span class="badge badge-high">No</span>'}</td>`)
        .join("")}</tr>
      <tr><td>Headroom</td>${costs.map((v) => `<td>${fmtNumber(budget - v)}</td>`).join("")}</tr>
    </tbody>
  `;
}

function wireBudgetInput() {
  if (budgetInputWired) return;
  const input = document.querySelector("[data-budget-input]");
  if (!input) return;
  budgetInputWired = true;
  input.addEventListener("change", async () => {
    const value = input.value === "" ? "" : Number(input.value);
    await updateSettings({ availableBudget: value });
  });
}

function wireComparePhaseSelect() {
  if (comparePhaseWired) return;
  const select = document.querySelector("[data-contingency-phase-select]");
  if (!select) return;
  comparePhaseWired = true;
  select.addEventListener("change", () => {
    comparePhase = select.value;
    renderResults();
  });
}

function syncBudgetInput() {
  const input = document.querySelector("[data-budget-input]");
  if (!input) return;
  const value = currentState.settings?.availableBudget;
  if (document.activeElement !== input) {
    input.value = value === "" || value == null ? "" : value;
  }
}

onRegisterChange((state) => {
  currentState = state;
  wireBudgetInput();
  wireComparePhaseSelect();
  syncBudgetInput();
  renderResults();
});
