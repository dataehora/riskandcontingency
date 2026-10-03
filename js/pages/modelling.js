import { getRegisterState, onRegisterChange, updateSettings, saveModel, deleteModel } from "../storage/register-store.js";
import { pooledRecords, runMonteCarlo, summarize, curvePoints, mean, stdev, percentileKey } from "../storage/monte-carlo.js";
import { POOLED_RECORD_TYPE } from "../storage/workbook.js";
import { createRunChart } from "../charts/run-chart.js";
import { renderPercentileTable, SUMMARY_LEVELS, FULL_LEVELS } from "../charts/percentile-tables.js";
import { t, tn, tv, fmtInt, locale, onLangChange } from "../i18n/i18n.js";
import { askName } from "../inline-name.js";

const phaseLabel = (phase) => t(`phase.${phase}`);
// 500 evenly spaced quantiles per phase (rounded to cents) are what gets
// stored — enough to redraw the histograms at any bin size, small enough
// for one xlsx cell (~32k chars) with both phases.
const CURVE_POINTS = 500;

let currentState = getRegisterState();
// The run on screen: a fresh one (savedId null) or a loaded saved model.
// { phases, results: {phase: {summary, curve, storedCurve?, mean, stdev}},
//   trials, ranAt, scope, name, savedId }
let shown = null;

const fmtNumber = fmtInt;

const chart = createRunChart({
  chartEl: document.querySelector("[data-mc-chart]"),
  panelEl: document.querySelector("[data-chart-controls]"),
  storageKey: "modelling-chart-options",
  defaults: { bell: true },
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Which records a run includes, and why the others are left out — as
// counts, so a saved model keeps its scope. A partition of the whole
// register: every record lands in exactly one row (record type is
// checked first, then status).
function countTypes(records) {
  const threats = records.filter((r) => r.riskType === "Threat").length;
  return { threats, opportunities: records.length - threats, total: records.length };
}

function scopeCounts(records) {
  const rows = { included: [], highImpact: [], benchmark: [], notOpen: [] };
  for (const r of records) {
    if (r.recordType === "High Impact") rows.highImpact.push(r);
    else if (r.recordType !== POOLED_RECORD_TYPE) rows.benchmark.push(r);
    else if (r.status !== "Open") rows.notOpen.push(r);
    else rows.included.push(r);
  }
  return {
    included: countTypes(rows.included),
    highImpact: countTypes(rows.highImpact),
    benchmark: countTypes(rows.benchmark),
    notOpen: { ...countTypes(rows.notOpen), statuses: [...new Set(rows.notOpen.map((r) => r.status))] },
  };
}

function updatePooledCount() {
  const el = document.querySelector("[data-pooled-count]");
  const notice = document.querySelector("[data-mc-empty-notice]");
  const runBtn = document.querySelector("[data-run-simulation]");
  const count = pooledRecords(currentState.riskRecords).length;
  if (el) el.textContent = tn("mod.pooledCount", count, { total: fmtInt(currentState.riskRecords.length) });
  if (notice) notice.hidden = count > 0;
  if (runBtn) runBtn.disabled = count === 0;
}

function localizeTrialOptions() {
  document.querySelectorAll("[data-mc-trials] option").forEach((o) => {
    o.textContent = fmtInt(Number(o.value));
  });
}

function getSelectedPhases() {
  return [...document.querySelectorAll("[data-mc-phase-checkbox]")].filter((b) => b.checked).map((b) => b.value);
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
  if (!scope) {
    table.innerHTML = "";
    notes.innerHTML = "";
    return;
  }
  const row = (label, c, cls = "") =>
    `<tr class="${cls}"><td>${label}</td><td>${fmtInt(c.threats)}</td><td>${fmtInt(c.opportunities)}</td><td><strong>${fmtInt(c.total)}</strong></td></tr>`;
  const statuses = (scope.notOpen.statuses ?? []).map((s) => tv("status", s)).join(", ");
  const excluded = [
    scope.highImpact.total ? row(t("mod.scope.excludedHighImpact"), scope.highImpact) : "",
    scope.benchmark.total ? row(t("mod.scope.excludedBenchmark"), scope.benchmark) : "",
    scope.notOpen.total ? row(t("mod.scope.excludedStatus", { statuses }), scope.notOpen) : "",
  ].join("");
  table.innerHTML = `
    <thead><tr><th></th><th>${t("mod.scope.threats")}</th><th>${t("mod.scope.opportunities")}</th><th>${t("mod.scope.total")}</th></tr></thead>
    <tbody>
      ${row(t("mod.scope.included"), scope.included, "scope-included")}
      ${excluded}
    </tbody>
  `;
  const hi = scope.highImpact;
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
// distribution at the end of the page — one column per phase, read from
// each phase's summary (every P01..P99 is stored with the run).
function renderTables(run) {
  const columns = run.phases.map((phase) => {
    const { summary } = run.results[phase];
    const value = (level) => (level === "min" ? summary.min : level === "max" ? summary.max : summary.percentiles[percentileKey(level)]);
    return { label: phaseLabel(phase), cell: (level) => fmtNumber(value(level) ?? 0) };
  });
  renderPercentileTable(document.querySelector("[data-mc-table]"), SUMMARY_LEVELS, columns);
  renderPercentileTable(document.querySelector("[data-mc-full-table]"), FULL_LEVELS, columns);
}

function renderResults() {
  const resultsEl = document.querySelector("[data-mc-results]");
  if (!shown) {
    resultsEl.hidden = true;
    return;
  }
  resultsEl.hidden = false;
  const meta = {
    trials: fmtInt(shown.trials),
    phases: shown.phases.map(phaseLabel).join(" / "),
    date: new Date(shown.ranAt).toLocaleString(locale()),
    name: shown.name ?? "",
  };
  document.querySelector("[data-mc-run-meta]").textContent = t(shown.savedId ? "mod.runMetaSaved" : "mod.runMeta", meta);
  const saveBtn = document.querySelector("[data-mc-save]");
  saveBtn.hidden = !!shown.savedId;
  renderScope(shown.scope);
  chart.render(shown);
  renderTables(shown);
}

function renderSavedModels() {
  const select = document.querySelector("[data-mc-saved]");
  const del = document.querySelector("[data-mc-delete]");
  if (!select) return;
  const models = currentState.savedModels ?? [];
  select.innerHTML =
    `<option value="">${models.length ? t("mod.saved.choose") : t("mod.saved.none")}</option>` +
    models
      .map((m) => `<option value="${m.id}">${escapeHtml(m.name)} — ${new Date(m.createdAt).toLocaleString(locale())}</option>`)
      .join("");
  select.disabled = !models.length;
  select.value = shown?.savedId && models.some((m) => m.id === shown.savedId) ? shown.savedId : "";
  if (del) del.hidden = !select.value;
}

function loadSavedModel(id) {
  const model = (currentState.savedModels ?? []).find((m) => m.id === id);
  if (!model) return;
  shown = {
    phases: model.phases,
    results: model.results,
    trials: model.trials,
    ranAt: model.createdAt,
    scope: model.scope,
    name: model.name,
    savedId: model.id,
  };
  renderResults();
  renderSavedModels();
}

// What gets stored (last run in Settings, or a saved model): the stored
// quantile curve, never the raw trials.
function storableResults(run) {
  return Object.fromEntries(
    run.phases.map((phase) => {
      const r = run.results[phase];
      return [phase, { summary: r.summary, curve: r.storedCurve ?? r.curve, mean: r.mean, stdev: r.stdev }];
    })
  );
}

async function runSimulation() {
  const phases = getSelectedPhases();
  const trials = Number(document.querySelector("[data-mc-trials]").value);
  const runBtn = document.querySelector("[data-run-simulation]");

  runBtn.disabled = true;
  runBtn.textContent = t("mod.running");
  // Let the button label repaint before the (synchronous, CPU-bound) run.
  await new Promise((r) => setTimeout(r, 20));

  const results = {};
  for (const phase of phases) {
    const sorted = runMonteCarlo({ records: currentState.riskRecords, phase, trials });
    const m = mean(sorted);
    results[phase] = {
      summary: summarize(sorted),
      curve: sorted, // full trials for this page's chart
      storedCurve: curvePoints(sorted, CURVE_POINTS).map((p) => Math.round(p.value * 100) / 100),
      mean: m,
      stdev: stdev(sorted, m),
    };
  }
  const ranAt = new Date().toISOString();
  shown = { phases, results, trials, ranAt, scope: scopeCounts(currentState.riskRecords), name: null, savedId: null };
  renderResults();
  renderSavedModels();

  runBtn.disabled = false;
  runBtn.textContent = t("mod.runButton");

  await updateSettings({
    lastModelledAt: ranAt,
    lastModelledTrials: trials,
    lastModelledResultsJson: JSON.stringify({ phases, results: storableResults(shown) }),
  });
}

async function saveShownModel() {
  if (!shown || shown.savedId) return;
  const saveBtn = document.querySelector("[data-mc-save]");
  saveBtn.disabled = true;
  const name = await askName(document.querySelector("[data-mc-save-form]"), {
    label: t("mod.save.prompt"),
    value: t("mod.save.defaultName", { date: new Date(shown.ranAt).toLocaleString(locale()) }),
  });
  saveBtn.disabled = false;
  if (name === null || !shown || shown.savedId) return;
  const saved = await saveModel(name, {
    phases: shown.phases,
    results: storableResults(shown),
    trials: shown.trials,
    scope: shown.scope,
    ranAt: shown.ranAt,
  });
  if (!saved) return;
  shown = { ...shown, name: saved.name, savedId: saved.id };
  renderResults();
  renderSavedModels();
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
  document.querySelector("[data-mc-save]")?.addEventListener("click", saveShownModel);
  document.querySelector("[data-mc-saved]")?.addEventListener("change", (event) => {
    if (event.target.value) loadSavedModel(event.target.value);
    else renderSavedModels();
  });
  document.querySelector("[data-mc-delete]")?.addEventListener("click", async () => {
    const id = document.querySelector("[data-mc-saved]").value;
    const model = (currentState.savedModels ?? []).find((m) => m.id === id);
    if (!model || !window.confirm(t("mod.saved.confirmDelete", { name: model.name }))) return;
    if (await deleteModel(id)) {
      if (shown?.savedId === id) shown = { ...shown, savedId: null, name: null };
      renderResults();
      renderSavedModels();
    }
  });
}

onRegisterChange((state) => {
  currentState = state;
  updatePooledCount();
  renderSavedModels();
});
onLangChange(() => {
  updatePooledCount();
  localizeTrialOptions();
  renderSavedModels();
  chart.relabel();
  renderResults();
});
wire();
