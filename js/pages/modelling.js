import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import {
  pooledRecords,
  runMonteCarlo,
  summarize,
  curvePoints,
  histogram,
  mean,
  stdev,
  PERCENTILE_STEPS,
} from "../storage/monte-carlo.js";
import { renderDistributionChart } from "../charts/distribution-chart.js";

const PHASE_META = {
  pre: { label: "Pre-mitigation", color: "var(--color-risk-high)", dash: false },
  post: { label: "Post-mitigation", color: "var(--color-risk-low)", dash: true },
};
const BIN_COUNT = 30;

let currentState = getRegisterState();

function fmtNumber(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function updatePooledCount() {
  const el = document.querySelector("[data-pooled-count]");
  const notice = document.querySelector("[data-mc-empty-notice]");
  const runBtn = document.querySelector("[data-run-simulation]");
  const count = pooledRecords(currentState.riskRecords).length;
  if (el) {
    el.textContent = `${count} Regular Pooled Record risk${count === 1 ? "" : "s"} out of ${currentState.riskRecords.length} total will be simulated.`;
  }
  if (notice) notice.hidden = count > 0;
  if (runBtn) runBtn.disabled = count === 0;
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

function renderTable(runs, phases) {
  const table = document.querySelector("[data-mc-table]");
  if (!table) return;
  const cols = ["", "Min", ...PERCENTILE_STEPS.map((p) => `P${String(p).padStart(2, "0")}`), "Max"];
  const rows = phases.map((phase) => {
    const { summary } = runs[phase];
    const values = [
      PHASE_META[phase].label,
      summary.min,
      ...PERCENTILE_STEPS.map((p) => summary.percentiles[`P${String(p).padStart(2, "0")}`]),
      summary.max,
    ];
    return `<tr>${values.map((v, i) => (i === 0 ? `<td>${v}</td>` : `<td>${fmtNumber(v)}</td>`)).join("")}</tr>`;
  });
  table.innerHTML = `
    <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody>
  `;
}

async function runSimulation() {
  const phases = getSelectedPhases();
  const trials = Number(document.querySelector("[data-mc-trials]").value);
  const runBtn = document.querySelector("[data-run-simulation]");

  runBtn.disabled = true;
  runBtn.textContent = "Running…";
  // Let the button label repaint before the (synchronous, CPU-bound) run.
  await new Promise((r) => setTimeout(r, 20));

  const runs = {};
  for (const phase of phases) {
    const sorted = runMonteCarlo({ records: currentState.riskRecords, phase, trials });
    runs[phase] = { sorted, summary: summarize(sorted) };
  }

  const domainMin = Math.min(...phases.map((p) => runs[p].sorted[0] ?? 0));
  const domainMax = Math.max(...phases.map((p) => runs[p].sorted[runs[p].sorted.length - 1] ?? 0));
  const binWidth = (domainMax - domainMin || 1) / BIN_COUNT;

  const series = phases.map((phase) => {
    const { sorted, summary } = runs[phase];
    const m = mean(sorted);
    const sd = stdev(sorted, m);
    const hist = histogram(sorted, BIN_COUNT, domainMin, domainMax);
    runs[phase].curve = curvePoints(sorted, 200).map((p) => p.value);
    runs[phase].mean = m;
    runs[phase].stdev = sd;
    return {
      label: PHASE_META[phase].label,
      color: PHASE_META[phase].color,
      dash: PHASE_META[phase].dash,
      histogram: hist,
      mean: m,
      stdev: sd,
      trials,
      binWidth,
    };
  });

  const ranAt = new Date().toISOString();
  document.querySelector("[data-mc-results]").hidden = false;
  document.querySelector("[data-mc-run-meta]").textContent =
    `${trials.toLocaleString()} trials · ${phases.map((p) => PHASE_META[p].label).join(" & ")} · ${new Date(ranAt).toLocaleString()}`;
  renderDistributionChart(document.querySelector("[data-mc-chart]"), series);
  renderTable(runs, phases);

  runBtn.disabled = false;
  runBtn.textContent = "Run simulation";

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
  document.querySelector("[data-run-simulation]")?.addEventListener("click", () => {
    runSimulation().catch((err) => {
      console.error(err);
      const runBtn = document.querySelector("[data-run-simulation]");
      runBtn.disabled = false;
      runBtn.textContent = "Run simulation";
    });
  });
}

onRegisterChange((state) => {
  currentState = state;
  updatePooledCount();
});
wire();
