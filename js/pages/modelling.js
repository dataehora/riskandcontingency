import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import { pooledRecords, runMonteCarlo, summarize, curvePoints, PERCENTILE_STEPS } from "../storage/monte-carlo.js";
import { renderSCurve } from "../charts/s-curve.js";

let currentState = getRegisterState();
let lastResult = null; // { sorted, summary, phase, trials, ranAt }

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

function renderTable(summary) {
  const table = document.querySelector("[data-mc-table]");
  if (!table) return;
  const cols = ["Min", ...PERCENTILE_STEPS.map((p) => `P${String(p).padStart(2, "0")}`), "Max"];
  const values = [
    summary.min,
    ...PERCENTILE_STEPS.map((p) => summary.percentiles[`P${String(p).padStart(2, "0")}`]),
    summary.max,
  ];
  table.innerHTML = `
    <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody><tr>${values.map((v) => `<td>${fmtNumber(v)}</td>`).join("")}</tr></tbody>
  `;
}

async function runSimulation() {
  const phase = document.querySelector("[data-mc-phase]").value;
  const trials = Number(document.querySelector("[data-mc-trials]").value);
  const runBtn = document.querySelector("[data-run-simulation]");

  runBtn.disabled = true;
  runBtn.textContent = "Running…";
  // Let the button label repaint before the (synchronous, CPU-bound) run.
  await new Promise((r) => setTimeout(r, 20));

  const sorted = runMonteCarlo({ records: currentState.riskRecords, phase, trials });
  const summary = summarize(sorted);
  lastResult = { sorted, summary, phase, trials, ranAt: new Date().toISOString() };

  document.querySelector("[data-mc-results]").hidden = false;
  document.querySelector("[data-mc-run-meta]").textContent =
    `${trials.toLocaleString()} trials · ${phase === "pre" ? "Pre-mitigation" : "Post-mitigation"} · ${new Date(lastResult.ranAt).toLocaleString()}`;
  renderSCurve(document.querySelector("[data-mc-chart]"), sorted, summary);
  renderTable(summary);

  runBtn.disabled = false;
  runBtn.textContent = "Run simulation";

  // Persist a subsampled curve (<=200 points), not the raw trials array —
  // xlsx cells cap out around 32,767 characters, and 10,000 raw numbers
  // as JSON would blow past that. Contingency reads this to redraw the
  // same S-curve without re-running the simulation.
  const curve = curvePoints(sorted, 200).map((p) => p.value);
  await updateSettings({
    lastModelledAt: lastResult.ranAt,
    lastModelledTrials: trials,
    lastModelledResultsJson: JSON.stringify({ phase, summary, curve }),
  });
}

function wire() {
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
