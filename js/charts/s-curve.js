// Shared S-curve (cumulative probability) chart, used by both Modelling
// and Contingency. Single series -> no legend needed per the dataviz
// skill's rule; color reuses --color-primary-alt (already themed for
// light/dark in tokens.css). An optional `referenceLine` (e.g. an
// available budget) draws a second vertical marker distinct from the
// median crosshair.
import { curvePoints } from "../storage/monte-carlo.js";

function fmtNumber(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function renderSCurve(container, sorted, summary, options = {}) {
  const { referenceLine } = options; // { value, label }
  const width = 640;
  const height = 300;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 16;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const min = Math.min(summary.min, referenceLine?.value ?? summary.min);
  const max = Math.max(summary.max, referenceLine?.value ?? summary.max);
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
  const refLine = referenceLine
    ? `
      <line x1="${xOf(referenceLine.value)}" y1="${padTop}" x2="${xOf(referenceLine.value)}" y2="${height - padBottom}" stroke="var(--color-danger)" stroke-width="2" />
      <text x="${xOf(referenceLine.value)}" y="${padTop - 4}" text-anchor="middle" font-size="11" fill="var(--color-danger)">${referenceLine.label ?? "Reference"}</text>
    `
    : "";

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block;" role="img" aria-label="Cumulative probability curve" data-sc-svg>
      ${yGridlines}
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      ${xTicks}
      <path d="${pathD}" fill="none" stroke="var(--color-primary-alt)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ${refLine}
      <line data-sc-crosshair x1="${medianX}" y1="${padTop}" x2="${medianX}" y2="${height - padBottom}" stroke="var(--color-accent)" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
      <circle data-sc-hover-dot r="4" fill="var(--color-primary-alt)" opacity="0" />
      <rect data-sc-hover-target x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="transparent" />
    </svg>
    <div data-sc-tooltip class="notice" style="display:none; position:absolute; pointer-events:none; font-size:0.78rem; padding: 6px 10px;"></div>
    <p style="font-size:0.78rem; color: var(--color-text-subtle); margin-top: var(--space-2);">Simulated cost (x-axis) vs. cumulative probability of being at or below that cost (y-axis). Dashed line marks the median (P50)${referenceLine ? `; solid red line marks ${referenceLine.label ?? "the reference value"}.` : "."}</p>
  `;

  wireHover(container, points, xOf, yOf, padLeft, width - padRight, fmtNumber);
}

function wireHover(container, points, xOf, yOf, minX, maxX, fmtNumber) {
  const svg = container.querySelector("[data-sc-svg]");
  const target = container.querySelector("[data-sc-hover-target]");
  const dot = container.querySelector("[data-sc-hover-dot]");
  const crosshair = container.querySelector("[data-sc-crosshair]");
  const tooltip = container.querySelector("[data-sc-tooltip]");
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

    tooltip.style.display = "block";
    tooltip.style.left = `${(px / 640) * 100}%`;
    tooltip.style.top = `${(py / 300) * 100}%`;
    tooltip.textContent = `${fmtNumber(p.value)} at P${p.cumulative.toFixed(0)}`;
  });

  target.addEventListener("mouseleave", () => {
    dot.setAttribute("opacity", "0");
    tooltip.style.display = "none";
    crosshair.setAttribute("opacity", "0");
  });
}
