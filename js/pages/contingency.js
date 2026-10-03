import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import { FULL_PERCENTILE_STEPS, percentile, percentileKey } from "../storage/monte-carlo.js";
import { createRunChart } from "../charts/run-chart.js";
import { renderPercentileTable, SUMMARY_LEVELS, FULL_LEVELS } from "../charts/percentile-tables.js";
import { t, fmtInt, locale, onLangChange } from "../i18n/i18n.js";

const phaseLabel = (phase) => t(`phase.${phase}`);
const LATEST = "__latest__";

let currentState = getRegisterState();
let budgetInputWired = false;
let selectsWired = false;
let comparePhase = null; // user's chosen phase when a run has both
let compareSource = LATEST; // LATEST = last run on Modelling, else a saved model id

const fmtNumber = fmtInt;

const chart = createRunChart({
  chartEl: document.querySelector("[data-contingency-chart]"),
  panelEl: document.querySelector("[data-chart-controls]"),
  storageKey: "contingency-chart-options",
  defaults: { bell: false },
});

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// The run the budget is compared against: the last one stored by
// Modelling, or a saved (named) model chosen in "Modelling to compare".
// Same shape either way: { phases, results, trials, at, name }.
function selectedRun(settings) {
  if (compareSource !== LATEST) {
    const model = currentState.savedModels.find((m) => m.id === compareSource);
    if (model) return { phases: model.phases, results: model.results, trials: model.trials, at: model.createdAt, name: model.name };
    compareSource = LATEST;
  }
  const last = parseJson(settings.lastModelledResultsJson);
  if (!last) return null;
  return { ...last, trials: Number(settings.lastModelledTrials), at: settings.lastModelledAt, name: null };
}

function renderSourceSelector(settings) {
  const select = document.querySelector("[data-contingency-source]");
  if (!select) return;
  const latestLabel = settings.lastModelledAt
    ? t("cont.source.latest", { date: new Date(settings.lastModelledAt).toLocaleString(locale()) })
    : t("cont.source.latestNone");
  select.innerHTML =
    `<option value="${LATEST}">${latestLabel}</option>` +
    currentState.savedModels
      .map((m) => `<option value="${m.id}">${escapeHtml(m.name)} — ${new Date(m.createdAt).toLocaleDateString(locale())}</option>`)
      .join("");
  select.value = compareSource;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Every P01..P99 value for a stored run. Older runs stored fewer steps
// (up to P50, later every 5%); missing ones are read off the stored
// curve (evenly spaced sorted trial values), a close approximation.
function fullPercentiles(summary, curve) {
  const out = {};
  for (const p of FULL_PERCENTILE_STEPS) {
    const key = percentileKey(p);
    out[key] = Number.isFinite(summary.percentiles?.[key]) ? summary.percentiles[key] : percentile(curve ?? [], p);
  }
  return out;
}

// Highest of P01..P99 the budget meets or exceeds; above the modelled
// max it says it covers the whole modelled range.
function confidenceLabel(summary, percentiles, budget) {
  if (!Number.isFinite(budget)) return "—";
  if (budget < summary.min) return t("cont.conf.belowMin");
  if (budget >= summary.max) return t("cont.conf.full");
  let covered = null;
  for (const p of FULL_PERCENTILE_STEPS) {
    if (percentiles[percentileKey(p)] <= budget) covered = p;
  }
  return covered === null ? t("cont.conf.belowP05") : t("cont.conf.upTo", { p: percentileKey(covered) });
}

function resolveComparePhase(run) {
  const available = run.phases ?? [];
  if (comparePhase && available.includes(comparePhase)) return comparePhase;
  // Default to post-mitigation (residual risk) when both are available.
  return available.includes("post") ? "post" : available[0];
}

function renderPhaseSelector(run) {
  const wrap = document.querySelector("[data-contingency-phase-select-wrap]");
  const select = document.querySelector("[data-contingency-phase-select]");
  if (!wrap || !select) return;
  const available = run.phases ?? [];
  if (available.length < 2) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  select.innerHTML = available.map((p) => `<option value="${p}">${phaseLabel(p)}</option>`).join("");
  select.value = resolveComparePhase(run);
}

function renderResults() {
  const settings = currentState.settings ?? {};
  const budget = Number(settings.availableBudget);
  renderSourceSelector(settings);
  const run = selectedRun(settings);
  const resultsEl = document.querySelector("[data-contingency-results]");
  const noBudgetEl = document.querySelector("[data-contingency-no-budget]");

  const hasBudget = Number.isFinite(budget) && settings.availableBudget !== "" && settings.availableBudget != null;
  if (!run || !hasBudget) {
    if (resultsEl) resultsEl.hidden = true;
    if (noBudgetEl) noBudgetEl.hidden = false;
    return;
  }
  if (resultsEl) resultsEl.hidden = false;
  if (noBudgetEl) noBudgetEl.hidden = true;

  renderPhaseSelector(run);
  const phase = resolveComparePhase(run);
  const { summary, curve } = run.results[phase];
  const p50 = summary.percentiles.P50 ?? summary.min;

  document.querySelector("[data-contingency-run-meta]").textContent = t(run.name ? "cont.runMetaSaved" : "cont.runMeta", {
    name: run.name ?? "",
    trials: fmtInt(run.trials),
    phase: phaseLabel(phase),
    date: run.at ? new Date(run.at).toLocaleString(locale()) : "—",
  });
  document.querySelector("[data-contingency-budget]").textContent = fmtNumber(budget);
  const percentiles = fullPercentiles(summary, curve);
  document.querySelector("[data-contingency-confidence]").textContent = confidenceLabel(summary, percentiles, budget);
  // Gap to P50 = budget - P50: negative when the budget falls short of
  // the median modelled cost.
  const gapEl = document.querySelector("[data-contingency-gap]");
  const gap = budget - p50;
  gapEl.textContent = fmtNumber(gap);
  gapEl.style.color = gap < 0 ? "var(--color-danger)" : "var(--color-success)";

  chart.render(run, { referenceLine: { value: budget, label: t("cont.budget.label") } });

  // Same two tables as Modelling: summary (Min, P10..P90, Max) here,
  // the full 1%-step distribution at the end of the page.
  const value = (level) => (level === "min" ? summary.min : level === "max" ? summary.max : percentiles[percentileKey(level)]);
  const columns = [
    { label: t("cont.table.modelled"), cell: (level) => fmtNumber(value(level)) },
    {
      label: t("cont.table.covered"),
      cell: (level) =>
        budget >= value(level)
          ? `<span class="badge badge-low">${t("common.yes")}</span>`
          : `<span class="badge badge-high">${t("common.no")}</span>`,
    },
    { label: t("cont.table.headroom"), cell: (level) => fmtNumber(budget - value(level)) },
  ];
  renderPercentileTable(document.querySelector("[data-contingency-table]"), SUMMARY_LEVELS, columns);
  renderPercentileTable(document.querySelector("[data-contingency-full-table]"), FULL_LEVELS, columns);
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

function wireSelects() {
  if (selectsWired) return;
  selectsWired = true;
  document.querySelector("[data-contingency-phase-select]")?.addEventListener("change", (event) => {
    comparePhase = event.target.value;
    renderResults();
  });
  document.querySelector("[data-contingency-source]")?.addEventListener("change", (event) => {
    compareSource = event.target.value;
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
  wireSelects();
  syncBudgetInput();
  renderResults();
});
onLangChange(() => {
  if (currentState.status !== "ready") return;
  chart.relabel();
  renderResults();
});
