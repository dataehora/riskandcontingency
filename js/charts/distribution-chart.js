// Modelling chart: histogram of simulated Total Cost (bars, iterations
// on the LEFT y-axis) + cumulative S-curve (0-100% on the RIGHT y-axis),
// both on one shared cost x-axis that starts at 0 (or lower, only if the
// run has negative totals from opportunities). A thin fitted normal
// ("bell") curve stays as a reference line on the count axis.
// For 1 or 2 overlaid series (Pre-mitigation / Post-mitigation). Color
// carries identity per the user's explicit red/Pre, green/Post request,
// but per the dataviz skill's "never color alone" rule that pairing is
// risky for red-green color blindness, so each series also gets a
// distinct line style (solid vs. dashed) and a legend.
import { normalPdf, curvePoints } from "../storage/monte-carlo.js";
import { niceTicks, niceMax } from "./axis.js";
import { t, fmtInt as fmtNumber } from "../i18n/i18n.js";

// Share of sorted values <= x, as a %.
function cumulativeAt(sorted, x) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length ? (lo / sorted.length) * 100 : 0;
}

// series: [{ label, color, dash, histogram, mean, stdev, trials, binWidth, sorted }]
export function renderDistributionChart(container, series) {
  if (!container) return;
  if (!series.length) {
    container.innerHTML = "";
    return;
  }

  const width = 640;
  const height = 340;
  const padLeft = 64;
  const padRight = 62;
  const padTop = 20;
  const padBottom = 44;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const domainMin = Math.min(...series.map((s) => s.histogram[0].binStart));
  const domainMax = Math.max(...series.map((s) => s.histogram[s.histogram.length - 1].binEnd));
  const span = domainMax - domainMin || 1;
  const xOf = (v) => padLeft + ((v - domainMin) / span) * plotW;

  const maxCount = Math.max(1, ...series.flatMap((s) => s.histogram.map((b) => b.count)));
  const maxBellHeight = Math.max(
    0,
    ...series.map((s) => (s.stdev > 0 ? normalPdf(s.mean, s.mean, s.stdev) * s.trials * s.binWidth : 0))
  );
  const maxY = niceMax(Math.max(maxCount, maxBellHeight, 1), 5);
  const yOf = (c) => padTop + (1 - c / maxY) * plotH;
  const yPct = (pct) => padTop + (1 - pct / 100) * plotH;

  const leftTicks = niceTicks(0, maxY, 5)
    .map(
      (t) => `
      <line x1="${padLeft}" y1="${yOf(t)}" x2="${width - padRight}" y2="${yOf(t)}" stroke="var(--color-border)" stroke-width="1" />
      <text x="${padLeft - 8}" y="${yOf(t) + 4}" text-anchor="end" font-size="11" fill="var(--color-text-subtle)">${fmtNumber(t)}</text>
    `
    )
    .join("");
  const rightTicks = [0, 25, 50, 75, 100]
    .map(
      (t) => `
      <line x1="${width - padRight}" y1="${yPct(t)}" x2="${width - padRight + 4}" y2="${yPct(t)}" stroke="var(--color-border-strong)" stroke-width="1" />
      <text x="${width - padRight + 8}" y="${yPct(t) + 4}" text-anchor="start" font-size="11" fill="var(--color-text-subtle)">${t}%</text>
    `
    )
    .join("");

  const xTicks = niceTicks(domainMin, domainMax, 6)
    .map(
      (v) => `
      <line x1="${xOf(v)}" y1="${height - padBottom}" x2="${xOf(v)}" y2="${height - padBottom + 4}" stroke="var(--color-border-strong)" stroke-width="1" />
      <text x="${xOf(v)}" y="${height - padBottom + 17}" text-anchor="middle" font-size="11" fill="var(--color-text-subtle)">${fmtNumber(v)}</text>
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
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" fill-opacity="0.22" stroke="${s.color}" stroke-opacity="0.6" stroke-width="1"${dashAttr} />`;
        })
        .join("");
    })
    .join("");

  const bellsSvg = series
    .map((s) => {
      if (!(s.stdev > 0)) return "";
      const stepCount = 100;
      const d = Array.from({ length: stepCount + 1 }, (_, i) => {
        const x = domainMin + (span * i) / stepCount;
        const count = normalPdf(x, s.mean, s.stdev) * s.trials * s.binWidth;
        return `${i === 0 ? "M" : "L"}${xOf(x).toFixed(1)},${yOf(Math.min(count, maxY)).toFixed(1)}`;
      }).join(" ");
      const dashAttr = s.dash ? ' stroke-dasharray="6,4"' : "";
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.25" stroke-opacity="0.55"${dashAttr} />`;
    })
    .join("");

  // S-curve: flat at 0% from the left edge up to the first trial, the
  // empirical cumulative curve, then flat at 100% to the right edge.
  const sCurvesSvg = series
    .map((s) => {
      const points = curvePoints(s.sorted, 200);
      if (!points.length) return "";
      const path = [
        { value: domainMin, cumulative: 0 },
        { value: points[0].value, cumulative: 0 },
        ...points,
        { value: domainMax, cumulative: 100 },
      ]
        .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.value).toFixed(1)},${yPct(p.cumulative).toFixed(1)}`)
        .join(" ");
      const dashAttr = s.dash ? ' stroke-dasharray="7,4"' : "";
      return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${dashAttr} />`;
    })
    .join("");

  const legend = `<div class="chart-legend">
      ${series
        .map(
          (s) => `
        <span class="chart-legend-item">
          <span class="chart-legend-swatch" style="background:${s.color}; ${s.dash ? "border: 2px dashed " + s.color + "; background: transparent;" : ""}"></span>
          ${s.label}
        </span>`
        )
        .join("")}
    </div>`;

  container.style.position = "relative";
  container.innerHTML = `
    ${legend}
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block;" role="img" aria-label="${t("chart.dist.aria")}" data-dc-svg>
      ${leftTicks}
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      <line x1="${width - padRight}" y1="${padTop}" x2="${width - padRight}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="var(--color-border-strong)" stroke-width="1" />
      ${rightTicks}
      ${xTicks}
      <text x="14" y="${padTop + plotH / 2}" transform="rotate(-90 14 ${padTop + plotH / 2})" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">${t("chart.dist.iterations")}</text>
      <text x="${width - 16}" y="${padTop + plotH / 2}" transform="rotate(90 ${width - 16} ${padTop + plotH / 2})" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">${t("chart.dist.cumulative")}</text>
      <text x="${padLeft + plotW / 2}" y="${height - 6}" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">${t("chart.dist.totalCost")}</text>
      ${barsSvg}
      ${bellsSvg}
      ${sCurvesSvg}
      <line data-dc-crosshair x1="0" y1="${padTop}" x2="0" y2="${height - padBottom}" stroke="var(--color-accent)" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
      <rect data-dc-hover x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="transparent" />
    </svg>
    <div data-dc-tooltip class="notice" style="display:none; position:absolute; pointer-events:none; font-size:0.78rem; padding: 6px 10px; white-space:nowrap;"></div>
    <p style="font-size:0.78rem; color: var(--color-text-subtle); margin-top: var(--space-2);">${t("chart.dist.caption")}</p>
  `;

  wireHover(container, series, { xOf, domainMin, span, padLeft, plotW, width });
}

function wireHover(container, series, { domainMin, span, padLeft, plotW, width }) {
  const svg = container.querySelector("[data-dc-svg]");
  const target = container.querySelector("[data-dc-hover]");
  const crosshair = container.querySelector("[data-dc-crosshair]");
  const tooltip = container.querySelector("[data-dc-tooltip]");
  if (!svg || !target) return;

  target.addEventListener("mousemove", (event) => {
    const rect = svg.getBoundingClientRect();
    const px = Math.min(Math.max((event.clientX - rect.left) * (width / rect.width), padLeft), padLeft + plotW);
    const cost = domainMin + ((px - padLeft) / plotW) * span;
    crosshair.setAttribute("x1", px);
    crosshair.setAttribute("x2", px);
    crosshair.setAttribute("opacity", "1");
    tooltip.style.display = "block";
    const left = (px / width) * 100;
    tooltip.style.left = left > 60 ? "" : `${left + 1}%`;
    tooltip.style.right = left > 60 ? `${101 - left}%` : "";
    tooltip.style.top = "40px";
    tooltip.innerHTML = `<strong>≤ ${fmtNumber(cost)}</strong><br>${series
      .map((s) => `${s.label}: ${cumulativeAt(s.sorted, cost).toFixed(0)}%`)
      .join("<br>")}`;
  });
  target.addEventListener("mouseleave", () => {
    crosshair.setAttribute("opacity", "0");
    tooltip.style.display = "none";
  });
}
