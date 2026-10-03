import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import {
  pooledRecords,
  runMonteCarlo,
  summarize,
  curvePoints,
  histogram,
  mean,
  stdev,
  percentile,
} from "../storage/monte-carlo.js";
import { POOLED_RECORD_TYPE } from "../storage/workbook.js";
import { renderDistributionChart } from "../charts/distribution-chart.js";
import { renderPercentileTable, SUMMARY_LEVELS, FULL_LEVELS } from "../charts/percentile-tables.js";
import { t, tn, tv, fmtInt, locale, onLangChange } from "../i18n/i18n.js";

const PHASE_META = {
  pre: { color: "var(--color-risk-high)", dash: false },
  post: { color: "var(--color-risk-low)", dash: true },
};
const phaseLabel = (phase) => t(`phase.${phase}`);
const BIN_COUNT = 30;
const CURVE_POINTS = 500;

let currentState = getRegisterState();
// The last run on this page, kept so a language switch can redraw it.
let lastRun = null;

const fmtNumber = fmtInt;

// Which records a run includes, and why the others are left out. A
// partition of the whole register: every record lands in exactly one
// row (record type is checked first, then status).
function modelScope(records) {
  const rows = { included: [], highImpact: [], benchmark: [], notOpen: [] };
  for (const r of records) {
    if (r.recordType === "High Impact") rows.highImpact.push(r);
    else if (r.recordType !== POOLED_RECORD_TYPE) rows.benchmark.push(r);
    else if (r.status !== "Open") rows.notOpen.push(r);
    else rows.included.push(r);
  }
  return rows;
}

function countTypes(records) {
  const threats = records.filter((r) => r.riskType === "Threat").length;
  return { threats, opportunities: records.length - threats, total: records.length };
}

function updatePooledCount() {
  const el = document.querySelector("[data-pooled-count]");
  const notice = document.querySelector("[data-mc-empty-notice]");
  const runBtn = document.querySelector("[data-run-simulation]");
  const count = pooledRecords(currentState.riskRecords).length;
  if (el) {
    el.textContent = tn("mod.pooledCount", count, { total: fmtInt(currentState.riskRecords.length) });
  }
  if (notice) notice.hidden = count > 0;
  if (runBtn) runBtn.disabled = count === 0;
}

function localizeTrialOptions() {
  document.querySelectorAll("[data-mc-trials] option").forEach((o) => {
    o.textContent = fmtInt(Number(o.value));
  });
}

function getSelectedPhases() {
  return [...document.querySelectorAll("[data-mc-phase-checkbox]")]
    .filter((b) => b.checked)
    .map((b) => b.value);
}

// At least one phase must always stay selected.
function wirePhaseCheckboxes() {
  const boxes = [...document.querySelectorAll("[data-mc-phase-checkbox]")];
  boxes.forEach((box) => {
    box.addEventListener("change", () => {
      if (!boxes.some((b) => b.checked)) box.checked = true;
    });
  });
}

// Threats / opportunities included in the run, then each excluded group,
// plus an explicit statement when High Impact risks were left out.
function renderScope(scope) {
  const table = document.querySelector("[data-mc-scope-table]");
  const notes = document.querySelector("[data-mc-scope-notes]");
  if (!table || !notes) return;
  const row = (label, records, cls = "") => {
    const c = countTypes(records);
    return `<tr class="${cls}"><td>${label}</td><td>${fmtInt(c.threats)}</td><td>${fmtInt(c.opportunities)}</td><td><strong>${fmtInt(c.total)}</strong></td></tr>`;
  };
  const statuses = [...new Set(scope.notOpen.map((r) => r.status))].map((s) => tv("status", s)).join(", ");
  const excluded = [
    scope.highImpact.length ? row(t("mod.scope.excludedHighImpact"), scope.highImpact) : "",
    scope.benchmark.length ? row(t("mod.scope.excludedBenchmark"), scope.benchmark) : "",
    scope.notOpen.length ? row(t("mod.scope.excludedStatus", { statuses }), scope.notOpen) : "",
  ].join("");
  table.innerHTML = `
    <thead><tr><th></th><th>${t("mod.scope.threats")}</th><th>${t("mod.scope.opportunities")}</th><th>${t("mod.scope.total")}</th></tr></thead>
    <tbody>
      ${row(t("mod.scope.included"), scope.included, "scope-included")}
      ${excluded}
    </tbody>
  `;

  const hi = countTypes(scope.highImpact);
  notes.innerHTML = hi.total
    ? `<div class="notice notice-warning" style="margin-top: var(--space-3);">
        <span aria-hidden="true">&#9888;&#65039;</span>
        <p style="margin:0;">${tn("mod.scope.highImpactNote", hi.total, {
          threats: tn("rr.summary.threats", hi.threats),
          opportunities: tn("rr.summary.opportunities", hi.opportunities),
        })}</p>
      </div>`
    : `<p style="font-size:0.85rem; margin-top: var(--space-2);">${t("mod.scope.noHighImpact")}</p>`;
}

// Summary (Min, P10..P90, Max) under the chart and the full 1%-step
// distribution at the end of the page — one column per phase, computed
// exactly from this run's sorted trials.
function renderTables(runs, phases) {
  const columns = phases.map((phase) => {
    const { sorted } = runs[phase];
    const value = (level) => (level === "min" ? sorted[0] : level === "max" ? sorted[sorted.length - 1] : percentile(sorted, level));
    return { label: phaseLabel(phase), cell: (level) => fmtNumber(value(level) ?? 0) };
  });
  renderPercentileTable(document.querySelector("[data-mc-table]"), SUMMARY_LEVELS, columns);
  renderPercentileTable(document.querySelector("[data-mc-full-table]"), FULL_LEVELS, columns);
}

function renderResults() {
  if (!lastRun) return;
  const { runs, phases, trials, ranAt, scope, binWidth, domainMin, domainMax } = lastRun;
  const series = phases.map((phase) => {
    const { sorted } = runs[phase];
    return {
      label: phaseLabel(phase),
      color: PHASE_META[phase].color,
      dash: PHASE_META[phase].dash,
      histogram: histogram(sorted, BIN_COUNT, domainMin, domainMax),
      mean: runs[phase].mean,
      stdev: runs[phase].stdev,
      trials,
      binWidth,
      sorted,
    };
  });

  document.querySelector("[data-mc-results]").hidden = false;
  document.querySelector("[data-mc-run-meta]").textContent = t("mod.runMeta", {
    trials: fmtInt(trials),
    phases: phases.map(phaseLabel).join(" / "),
    date: new Date(ranAt).toLocaleString(locale()),
  });
  renderScope(scope);
  renderDistributionChart(document.querySelector("[data-mc-chart]"), series);
  renderTables(runs, phases);
}

async function runSimulation() {
  const phases = getSelectedPhases();
  const trials = Number(document.querySelector("[data-mc-trials]").value);
  const runBtn = document.querySelector("[data-run-simulation]");

  runBtn.disabled = true;
  runBtn.textContent = t("mod.running");
  // Let the button label repaint before the (synchronous, CPU-bound) run.
  await new Promise((r) => setTimeout(r, 20));

  const runs = {};
  for (const phase of phases) {
    const sorted = runMonteCarlo({ records: currentState.riskRecords, phase, trials });
    runs[phase] = { sorted, summary: summarize(sorted) };
  }

  // Cost axis starts at 0 (only extends below it if opportunities push
  // some trial totals negative).
  const domainMin = Math.min(0, ...phases.map((p) => runs[p].sorted[0] ?? 0));
  const domainMax = Math.max(...phases.map((p) => runs[p].sorted[runs[p].sorted.length - 1] ?? 0));
  const binWidth = (domainMax - domainMin || 1) / BIN_COUNT;

  for (const phase of phases) {
    const { sorted } = runs[phase];
    const m = mean(sorted);
    // 500 evenly spaced quantiles (rounded to cents): enough for
    // Contingency to redraw the histograms at any bin size, small enough
    // for one xlsx cell (~32k chars) with both phases.
    runs[phase].curve = curvePoints(sorted, CURVE_POINTS).map((p) => Math.round(p.value * 100) / 100);
    runs[phase].mean = m;
    runs[phase].stdev = stdev(sorted, m);
  }

  const ranAt = new Date().toISOString();
  lastRun = { runs, phases, trials, ranAt, scope: modelScope(currentState.riskRecords), binWidth, domainMin, domainMax };
  renderResults();

  runBtn.disabled = false;
  runBtn.textContent = t("mod.runButton");

  // Persist a subsampled curve per phase (<=200 points), not the raw
  // trials array — xlsx cells cap out around 32,767 characters, and
  // 10,000 raw numbers as JSON would blow past that. Contingency reads
  // this to redraw an S-curve without re-running the simulation.
  const results = {};
  for (const phase of phases) {
    const { summary, curve, mean: m, stdev: sd } = runs[phase];
    results[phase] = { summary, curve, mean: m, stdev: sd };
  }
  await updateSettings({
    lastModelledAt: ranAt,
    lastModelledTrials: trials,
    lastModelledResultsJson: JSON.stringify({ phases, results }),
  });
}

function wire() {
  wirePhaseCheckboxes();
  localizeTrialOptions();
  document.querySelector("[data-run-simulation]")?.addEventListener("click", () => {
    runSimulation().catch((err) => {
      console.error(err);
      const runBtn = document.querySelector("[data-run-simulation]");
      runBtn.disabled = false;
      runBtn.textContent = t("mod.runButton");
    });
  });
}

onRegisterChange((state) => {
  currentState = state;
  updatePooledCount();
});
onLangChange(() => {
  updatePooledCount();
  localizeTrialOptions();
  renderResults();
});
wire();
