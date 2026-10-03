import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import { FULL_PERCENTILE_STEPS, percentile, percentileKey, histogram } from "../storage/monte-carlo.js";
import { renderDistributionChart } from "../charts/distribution-chart.js";
import { renderPercentileTable, SUMMARY_LEVELS, FULL_LEVELS } from "../charts/percentile-tables.js";
import { t, fmtInt, locale, onLangChange } from "../i18n/i18n.js";

const phaseLabel = (phase) => t(`phase.${phase}`);

let currentState = getRegisterState();
let budgetInputWired = false;
let comparePhaseWired = false;
let comparePhase = null; // user's chosen phase when a run has both

const fmtNumber = fmtInt;

// --- Chart options (right-hand panel) -----------------------------------
// Pre/Post histograms + S-curves overlaid, like Modelling, plus the budget
// line and marked percentiles. Kept per browser (a viewing preference,
// not register data).
const PHASE_STYLE = {
  pre: { color: "var(--color-risk-high)", dash: false },
  post: { color: "var(--color-risk-low)", dash: true },
};
const OPTIONS_KEY = "contingency-chart-options";
const DEFAULT_OPTIONS = { phases: { pre: true, post: true }, histogram: true, scurve: true, binWidth: null, markers: [20, 50, 80] };
const AUTO_BINS = 30;
const MAX_BINS = 200;

function loadOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "null");
    if (saved && typeof saved === "object") return { ...DEFAULT_OPTIONS, ...saved, phases: { ...DEFAULT_OPTIONS.phases, ...saved.phases } };
  } catch {
    // ignore — fall back to defaults
  }
  return structuredClone(DEFAULT_OPTIONS);
}

let chartOptions = loadOptions();

function saveOptions() {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(chartOptions));
  } catch {
    // storage blocked — options just won't persist
  }
}

// Bins over [domainMin, domainMax] at the chosen width (or AUTO_BINS equal
// bins). Each stored curve point is an equal share of the trials, so a
// bin's height = points in it / points x trials.
function binning(domainMin, domainMax) {
  const span = domainMax - domainMin || 1;
  const width = chartOptions.binWidth > 0 ? Math.max(chartOptions.binWidth, span / MAX_BINS) : span / AUTO_BINS;
  const count = Math.max(1, Math.ceil(span / width - 1e-9));
  return { width, count, max: domainMin + count * width };
}

function renderChart(lastRun, budget, trials) {
  const container = document.querySelector("[data-contingency-chart]");
  const available = (lastRun.phases ?? []).filter((p) => lastRun.results[p]?.curve?.length);
  const phases = available.filter((p) => chartOptions.phases[p]);
  const curves = phases.map((p) => lastRun.results[p].curve);
  const domainMin = Math.min(0, budget, ...curves.map((c) => c[0]));
  const rawMax = Math.max(budget, ...curves.map((c) => c[c.length - 1]));
  const bins = binning(domainMin, rawMax);
  const series = phases.map((phase) => {
    const curve = lastRun.results[phase].curve;
    const scale = (trials || curve.length) / curve.length;
    return {
      label: phaseLabel(phase),
      color: PHASE_STYLE[phase].color,
      dash: PHASE_STYLE[phase].dash,
      histogram: histogram(curve, bins.count, domainMin, bins.max).map((b) => ({ ...b, count: b.count * scale })),
      trials: trials || curve.length,
      binWidth: bins.width,
      sorted: curve,
    };
  });
  renderDistributionChart(container, series, {
    showHistogram: chartOptions.histogram,
    showSCurve: chartOptions.scurve,
    showBell: false,
    markers: chartOptions.markers,
    referenceLine: { value: budget, label: t("cont.budget.label") },
  });
  renderControls(available, bins.width);
}

function renderControls(available, binWidth) {
  const panel = document.querySelector("[data-chart-controls]");
  if (!panel) return;
  panel.querySelectorAll("[data-chart-phase]").forEach((box) => {
    const phase = box.dataset.chartPhase;
    box.closest("label").hidden = !available.includes(phase);
    box.checked = !!chartOptions.phases[phase];
  });
  panel.querySelector('[data-chart-layer="histogram"]').checked = chartOptions.histogram;
  panel.querySelector('[data-chart-layer="scurve"]').checked = chartOptions.scurve;
  const binInput = panel.querySelector("[data-chart-bin-width]");
  if (document.activeElement !== binInput) binInput.value = chartOptions.binWidth ?? "";
  panel.querySelector("[data-chart-bin-note]").textContent = t(chartOptions.binWidth ? "cont.chart.binCurrent" : "cont.chart.binAutoNote", {
    width: fmtNumber(binWidth),
  });
  panel.querySelector("[data-chart-markers]").innerHTML = chartOptions.markers.length
    ? chartOptions.markers
        .map(
          (p) =>
            `<span class="marker-chip">${percentileKey(p)}<button type="button" data-chart-marker-remove="${p}" aria-label="${t("cont.chart.markerRemove", { p: percentileKey(p) })}">&times;</button></span>`
        )
        .join("")
    : `<span class="chart-controls-note">${t("cont.chart.noMarkers")}</span>`;
}

let chartControlsWired = false;
function wireChartControls() {
  if (chartControlsWired) return;
  const panel = document.querySelector("[data-chart-controls]");
  if (!panel) return;
  chartControlsWired = true;
  const update = () => {
    saveOptions();
    renderResults();
  };
  panel.addEventListener("change", (event) => {
    const phaseBox = event.target.closest("[data-chart-phase]");
    if (phaseBox) {
      chartOptions.phases[phaseBox.dataset.chartPhase] = phaseBox.checked;
      return update();
    }
    const layerBox = event.target.closest("[data-chart-layer]");
    if (layerBox) {
      chartOptions[layerBox.dataset.chartLayer] = layerBox.checked;
      return update();
    }
    const bin = event.target.closest("[data-chart-bin-width]");
    if (bin) {
      const v = Number(bin.value);
      chartOptions.binWidth = bin.value === "" || !(v > 0) ? null : v;
      return update();
    }
  });
  panel.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-chart-marker-remove]");
    if (!remove) return;
    chartOptions.markers = chartOptions.markers.filter((p) => p !== Number(remove.dataset.chartMarkerRemove));
    update();
  });
  panel.querySelector("[data-chart-marker-add]").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = panel.querySelector("[data-chart-marker-input]");
    const p = Math.round(Number(input.value));
    if (!(p >= 1 && p <= 99)) return;
    if (!chartOptions.markers.includes(p)) chartOptions.markers = [...chartOptions.markers, p].sort((a, b) => a - b);
    input.value = "";
    update();
  });
}

function parseLastRun(settings) {
  if (!settings?.lastModelledResultsJson) return null;
  try {
    return JSON.parse(settings.lastModelledResultsJson);
  } catch {
    return null;
  }
}

// Every P01..P99 value for a stored run. Older runs stored fewer steps
// (up to P50, later every 5%); missing ones are read off the stored
// curve (200 evenly spaced sorted trial values), a close approximation.
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
  select.innerHTML = available.map((p) => `<option value="${p}">${phaseLabel(p)}</option>`).join("");
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

  document.querySelector("[data-contingency-run-meta]").textContent = t("cont.runMeta", {
    trials: fmtInt(Number(settings.lastModelledTrials)),
    phase: phaseLabel(phase),
    date: settings.lastModelledAt ? new Date(settings.lastModelledAt).toLocaleString(locale()) : "—",
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

  wireChartControls();
  renderChart(lastRun, budget, Number(settings.lastModelledTrials));

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
onLangChange(() => {
  if (currentState.status === "ready") renderResults();
});
