// Histogram + fitted normal ("bell") curve, for 1 or 2 overlaid series
// (Pre-mitigation / Post-mitigation). Color carries identity per the
// user's explicit red/Pre, green/Post request, but per the dataviz
// skill's "never color alone" rule that pairing is risky for red-green
// color blindness, so each series also gets a distinct line style
// (solid vs. dashed) and a legend — identity survives even without color.
import { normalPdf } from "../storage/monte-carlo.js";

function fmtNumber(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// series: [{ label, color, dash: boolean, histogram, mean, stdev, trials, binWidth }]
export function renderDistributionChart(container, series) {
  if (!container) return;
  if (!series.length) {
    container.innerHTML = "";
    return;
  }

  const width = 640;
  const height = 320;
  const padLeft = 56;
  const padRight = 20;
  const padTop = 16;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const domainMin = Math.min(...series.map((s) => s.histogram[0].binStart));
  const domainMax = Math.max(...series.map((s) => s.histogram[s.histogram.length - 1].binEnd));
  const span = domainMax - domainMin || 1;
  const xOf = (v) => padLeft + ((v - domainMin) / span) * plotW;

  const maxCount = Math.max(1, ...series.flatMap((s) => s.histogram.map((b) => b.count)));
  const maxBellHeight = Math.max(
    0,
    ...series.map((s) => normalPdf(s.mean, s.mean, s.stdev) * s.trials * s.binWidth)
  );
  const maxY = Math.max(maxCount, maxBellHeight, 1);
  const yOf = (c) => padTop + (1 - c / maxY) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxY));
  const yGridlines = yTicks
    .map(
      (t) => `
      <line x1="${padLeft}" y1="${yOf(t)}" x2="${width - padRight}" y2="${yOf(t)}" stroke="var(--color-border)" stroke-width="1" />
      <text x="${padLeft - 8}" y="${yOf(t) + 4}" text-anchor="end" font-size="11" fill="var(--color-text-subtle)">${fmtNumber(t)}</text>
    `
    )
    .join("");

  const xTickCount = 6;
  const xTicks = Array.from({ length: xTickCount }, (_, i) => domainMin + (span * i) / (xTickCount - 1))
    .map(
      (v) => `
      <text x="${xOf(v)}" y="${height - padBottom + 18}" text-anchor="middle" font-size="11" fill="var(--color-text-subtle)">${fmtNumber(v)}</text>
    `
    )
    .join("");

  const barsSvg = series
    .map((s) => {
      const dashAttr = s.dash ? ' stroke-dasharray="4,3"' : "";
      return s.histogram
        .map((bin) => {
          const x = xOf(bin.binStart);
          const w = Math.max(0, xOf(bin.binEnd) - x);
          const y = yOf(bin.count);
          const h = yOf(0) - y;
          if (h <= 0) return "";
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" fill-opacity="0.28" stroke="${s.color}" stroke-width="1"${dashAttr} />`;
        })
        .join("");
    })
    .join("");

  const bellsSvg = series
    .map((s) => {
      const stepCount = 100;
      const points = Array.from({ length: stepCount + 1 }, (_, i) => {
        const x = domainMin + (span * i) / stepCount;
        const count = normalPdf(x, s.mean, s.stdev) * s.trials * s.binWidth;
        return `${i === 0 ? "M" : "L"}${xOf(x).toFixed(1)},${yOf(count).toFixed(1)}`;
      }).join(" ");
      const dashAttr = s.dash ? ' stroke-dasharray="6,4"' : "";
      return `<path d="${points}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${dashAttr} />`;
    })
    .join("");

  const legendSvg =
    series.length > 1
      ? `<div class="chart-legend">
          ${series
            .map(
              (s) => `
            <span class="chart-legend-item">
              <span class="chart-legend-swatch" style="background:${s.color}; ${s.dash ? "border: 2px dashed " + s.color + "; background: transparent;" : ""}"></span>
              ${s.label}
            </span>
          `
            )
            .join("")}
        </div>`
      : "";

  container.innerHTML = `
    ${legendSvg}
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" role="img" aria-label="Histogram and fitted normal distribution of simulated Total Cost">
      ${yGridlines}
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      ${xTicks}
      ${barsSvg}
      ${bellsSvg}
    </svg>
    <p style="font-size:0.78rem; color: var(--color-text-subtle); margin-top: var(--space-2);">Simulated Total Cost (x-axis) vs. frequency across trials (y-axis). Bars are the simulated distribution; the smooth line is a fitted normal curve for reference.</p>
  `;
}
