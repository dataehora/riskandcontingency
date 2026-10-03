// A Monte Carlo run's chart + its options panel, shared by Modelling and
// Contingency: Pre/Post histograms and S-curves overlaid (distribution-
// chart.js), with a panel to toggle each phase, histograms, S-curves and
// the fitted normal curve, set the bin size, and choose which percentiles
// are marked (with or without their values). Options persist per browser
// (localStorage, one key per page) — a viewing preference, not register
// data.
//
// run: { phases: ["pre"|"post"], results: { pre?: {curve, mean, stdev},
// post?: {...} }, trials }. `curve` is either the run's full sorted
// trials (a fresh run on Modelling) or a stored, evenly spaced quantile
// curve (a saved or last-stored run): each value is an equal share of the
// trials either way, so a histogram bin's height = values in bin ÷
// values × trials.
import { histogram, percentileKey } from "../storage/monte-carlo.js";
import { renderDistributionChart } from "./distribution-chart.js";
import { t, fmtInt, getLang } from "../i18n/i18n.js";

const PHASE_STYLE = {
  pre: { color: "var(--color-risk-high)", dash: false },
  post: { color: "var(--color-risk-low)", dash: true },
};
const AUTO_BINS = 30;
const MAX_BINS = 200;
const BASE_DEFAULTS = {
  phases: { pre: true, post: true },
  histogram: true,
  scurve: true,
  bell: false,
  values: true,
  binWidth: null,
  markers: [20, 50, 80],
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function createRunChart({ chartEl, panelEl, storageKey, defaults = {}, onChange = () => {} }) {
  const initial = { ...BASE_DEFAULTS, ...defaults };
  let options = load();
  let builtLang = null;
  let last = null; // { run, extras } of the latest render, for redraws

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved === "object") return { ...initial, ...saved, phases: { ...initial.phases, ...saved.phases } };
    } catch {
      // ignore — fall back to defaults
    }
    return JSON.parse(JSON.stringify(initial));
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(options));
    } catch {
      // storage blocked — options just won't persist
    }
  }

  function changed() {
    save();
    if (last) render(last.run, last.extras);
    onChange(options);
  }

  function buildPanel() {
    if (!panelEl || builtLang === getLang()) return;
    builtLang = getLang();
    const check = (attr, value, label) =>
      `<label class="inline-check"><input type="checkbox" ${attr}="${value}"> <span>${label}</span></label>`;
    panelEl.innerHTML = `
      <fieldset>
        <legend>${t("cont.chart.phases")}</legend>
        ${check("data-chart-phase", "pre", t("phase.pre"))}
        ${check("data-chart-phase", "post", t("phase.post"))}
      </fieldset>
      <fieldset>
        <legend>${t("cont.chart.layers")}</legend>
        ${check("data-chart-layer", "histogram", t("cont.chart.histograms"))}
        ${check("data-chart-layer", "scurve", t("cont.chart.scurves"))}
        ${check("data-chart-layer", "bell", t("cont.chart.bell"))}
      </fieldset>
      <fieldset>
        <legend>${t("cont.chart.binSize")}</legend>
        <input type="number" min="0" step="any" data-chart-bin-width placeholder="${escapeHtml(t("cont.chart.binAuto"))}" aria-label="${escapeHtml(t("cont.chart.binSize"))}">
        <p class="chart-controls-note" data-chart-bin-note></p>
      </fieldset>
      <fieldset>
        <legend>${t("cont.chart.markers")}</legend>
        <div class="marker-chips" data-chart-markers></div>
        <form class="marker-add" data-chart-marker-add>
          <input type="number" min="1" max="99" step="1" data-chart-marker-input placeholder="P" aria-label="${escapeHtml(t("cont.chart.markerAdd"))}">
          <button class="btn btn-secondary btn-sm" type="submit">${t("common.add")}</button>
        </form>
        ${check("data-chart-layer", "values", t("cont.chart.showValues"))}
      </fieldset>
    `;
  }

  function syncPanel(available, binWidth) {
    if (!panelEl) return;
    panelEl.querySelectorAll("[data-chart-phase]").forEach((box) => {
      const phase = box.dataset.chartPhase;
      box.closest("label").hidden = !available.includes(phase);
      box.checked = !!options.phases[phase];
    });
    panelEl.querySelectorAll("[data-chart-layer]").forEach((box) => {
      box.checked = !!options[box.dataset.chartLayer];
    });
    const binInput = panelEl.querySelector("[data-chart-bin-width]");
    if (document.activeElement !== binInput) binInput.value = options.binWidth ?? "";
    panelEl.querySelector("[data-chart-bin-note]").textContent = t(options.binWidth ? "cont.chart.binCurrent" : "cont.chart.binAutoNote", {
      width: fmtInt(binWidth),
    });
    panelEl.querySelector("[data-chart-markers]").innerHTML = options.markers.length
      ? options.markers
          .map(
            (p) =>
              `<span class="marker-chip">${percentileKey(p)}<button type="button" data-chart-marker-remove="${p}" aria-label="${escapeHtml(t("cont.chart.markerRemove", { p: percentileKey(p) }))}">&times;</button></span>`
          )
          .join("")
      : `<span class="chart-controls-note">${t("cont.chart.noMarkers")}</span>`;
  }

  function wirePanel() {
    if (!panelEl) return;
    panelEl.addEventListener("change", (event) => {
      const phaseBox = event.target.closest("[data-chart-phase]");
      if (phaseBox) {
        options.phases[phaseBox.dataset.chartPhase] = phaseBox.checked;
        return changed();
      }
      const layerBox = event.target.closest("[data-chart-layer]");
      if (layerBox) {
        options[layerBox.dataset.chartLayer] = layerBox.checked;
        return changed();
      }
      const bin = event.target.closest("[data-chart-bin-width]");
      if (bin) {
        const v = Number(bin.value);
        options.binWidth = bin.value === "" || !(v > 0) ? null : v;
        return changed();
      }
    });
    panelEl.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-chart-marker-remove]");
      if (!remove) return;
      options.markers = options.markers.filter((p) => p !== Number(remove.dataset.chartMarkerRemove));
      changed();
    });
    panelEl.addEventListener("submit", (event) => {
      if (!event.target.closest("[data-chart-marker-add]")) return;
      event.preventDefault();
      const input = panelEl.querySelector("[data-chart-marker-input]");
      const p = Math.round(Number(input.value));
      if (!(p >= 1 && p <= 99)) return;
      if (!options.markers.includes(p)) options.markers = [...options.markers, p].sort((a, b) => a - b);
      input.value = "";
      changed();
    });
  }

  // extras: { referenceLine?: {value, label} }
  function render(run, extras = {}) {
    last = { run, extras };
    buildPanel();
    const available = (run.phases ?? []).filter((p) => run.results?.[p]?.curve?.length);
    const phases = available.filter((p) => options.phases[p]);
    const curves = phases.map((p) => run.results[p].curve);
    const ref = extras.referenceLine?.value;
    const domainMin = Math.min(0, ...(Number.isFinite(ref) ? [ref] : []), ...curves.map((c) => c[0]));
    const rawMax = Math.max(...(Number.isFinite(ref) ? [ref] : []), ...curves.map((c) => c[c.length - 1]), domainMin + 1);
    const span = rawMax - domainMin || 1;
    const binWidth = options.binWidth > 0 ? Math.max(options.binWidth, span / MAX_BINS) : span / AUTO_BINS;
    const binCount = Math.max(1, Math.ceil(span / binWidth - 1e-9));
    const domainMax = domainMin + binCount * binWidth;

    const series = phases.map((phase) => {
      const r = run.results[phase];
      const trials = run.trials || r.curve.length;
      const scale = trials / r.curve.length;
      return {
        label: t(`phase.${phase}`),
        color: PHASE_STYLE[phase].color,
        dash: PHASE_STYLE[phase].dash,
        histogram: histogram(r.curve, binCount, domainMin, domainMax).map((b) => ({ ...b, count: b.count * scale })),
        mean: r.mean,
        stdev: r.stdev,
        trials,
        binWidth,
        sorted: r.curve,
      };
    });
    renderDistributionChart(chartEl, series, {
      showHistogram: options.histogram,
      showSCurve: options.scurve,
      showBell: options.bell,
      markers: options.markers,
      showValues: options.values,
      referenceLine: extras.referenceLine ?? null,
    });
    syncPanel(available, binWidth);
  }

  wirePanel();
  return {
    render,
    redraw() {
      if (last) render(last.run, last.extras);
    },
    // Language switched: the panel's labels need rebuilding.
    relabel() {
      builtLang = null;
      if (last) render(last.run, last.extras);
    },
  };
}
