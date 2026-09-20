import { getRegisterState, onRegisterChange, updateSettings } from "../storage/register-store.js";
import { pooledRecords, runMonteCarlo, summarize, curvePoints, PERCENTILE_STEPS } from "../storage/monte-carlo.js";

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

// --- S-curve chart (single series -> no legend needed; palette reuses
// the design system's --color-primary-alt, already validated for light
// and dark surfaces in the shared token set). ---
function renderChart(sorted, summary) {
  const container = document.querySelector("[data-mc-chart]");
  if (!container) return;

  const width = 640;
  const height = 300;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 16;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const min = summary.min;
  const max = summary.max;
  const span = max - min || 1;
  const xOf = (v) => padLeft + ((v - min) / span) * plotW;
  const yOf = (pct) => padTop + (1 - pct / 100) * plotH;

  const points = curvePoints(sorted, 200);
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.value).toFixed(1)},${yOf(p.cumulative).toFixed(1)}`)
    .join(" ");

  const yTicks = [0, 25, 50, 75, 100];
  const yGridlines = yTicks
    .map(
      (t) => `
      <line x1="${padLeft}" y1="${yOf(t)}" x2="${width - padRight}" y2="${yOf(t)}" stroke="var(--color-border)" stroke-width="1" />
      <text x="${padLeft - 8}" y="${yOf(t) + 4}" text-anchor="end" font-size="11" fill="var(--color-text-subtle)">${t}%</text>
    `
    )
    .join("");

  const xTickValues = [min, summary.percentiles.P25 ?? min, summary.percentiles.P50 ?? max, max];
  const xTicks = xTickValues
    .map(
      (v) => `
      <text x="${xOf(v)}" y="${height - padBottom + 18}" text-anchor="middle" font-size="11" fill="var(--color-text-subtle)">${fmtNumber(v)}</text>
    `
    )
    .join("");

  const medianX = xOf(summary.percentiles.P50 ?? min);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" role="img" aria-label="Cumulative probability curve of simulated Total Cost" data-mc-svg>
      ${yGridlines}
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      ${xTicks}
      <path d="${pathD}" fill="none" stroke="var(--color-primary-alt)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <line data-mc-crosshair x1="${medianX}" y1="${padTop}" x2="${medianX}" y2="${height - padBottom}" stroke="var(--color-accent)" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
      <circle data-mc-hover-dot r="4" fill="var(--color-primary-alt)" opacity="0" />
      <rect data-mc-hover-target x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="transparent" />
    </svg>
    <div data-mc-tooltip class="notice" style="display:none; position:absolute; pointer-events:none; font-size:0.78rem; padding: 6px 10px;"></div>
    <p style="font-size:0.78rem; color: var(--color-text-subtle); margin-top: var(--space-2);">Total simulated cost (x-axis) vs. cumulative probability of being at or below that cost (y-axis). Dashed line marks the median (P50).</p>
  `;

  wireHover(container, points, xOf, yOf, padLeft, width - padRight);
}

function wireHover(container, points, xOf, yOf, minX, maxX) {
  const svg = container.querySelector("[data-mc-svg]");
  const target = container.querySelector("[data-mc-hover-target]");
  const dot = container.querySelector("[data-mc-hover-dot]");
  const crosshair = container.querySelector("[data-mc-crosshair]");
  const tooltip = container.querySelector("[data-mc-tooltip]");
  if (!svg || !target) return;

  function nearestPoint(mouseX) {
    let nearest = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(xOf(p.value) - mouseX);
      if (d < bestDist) {
        bestDist = d;
        nearest = p;
      }
    }
    return nearest;
  }

  target.addEventListener("mousemove", (event) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = 640 / rect.width;
    const mouseX = Math.min(Math.max((event.clientX - rect.left) * scaleX, minX), maxX);
    const p = nearestPoint(mouseX);
    const px = xOf(p.value);
    const py = yOf(p.cumulative);

    dot.setAttribute("cx", px);
    dot.setAttribute("cy", py);
    dot.setAttribute("opacity", "1");
    crosshair.setAttribute("x1", px);
    crosshair.setAttribute("x2", px);
    crosshair.setAttribute("opacity", "1");
    crosshair.removeAttribute("stroke-dasharray");
    crosshair.setAttribute("stroke-dasharray", "3,3");

    tooltip.style.display = "block";
    tooltip.style.left = `${(px / 640) * 100}%`;
    tooltip.style.top = `${(py / 300) * 100}%`;
    tooltip.textContent = `${fmtNumber(p.value)} at P${p.cumulative.toFixed(0)}`;
  });

  target.addEventListener("mouseleave", () => {
    dot.setAttribute("opacity", "0");
    tooltip.style.display = "none";
    crosshair.setAttribute("x1", xOf(points[Math.floor(points.length / 2)]?.value ?? 0));
    crosshair.setAttribute("x2", crosshair.getAttribute("x1"));
    crosshair.setAttribute("opacity", "0");
  });
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
  renderChart(sorted, summary);
  renderTable(summary);

  runBtn.disabled = false;
  runBtn.textContent = "Run simulation";

  await updateSettings({
    lastModelledAt: lastResult.ranAt,
    lastModelledTrials: trials,
    lastModelledResultsJson: JSON.stringify({ phase, summary }),
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
