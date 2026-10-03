// 5x5 Risk Assessment Matrix (RAM): bin configuration + risk placement.
// Pure functions, no DOM/storage — the config lives in the workbook's
// Settings sheet as `ramJson` (see register-store.js updateSettings),
// edited on the Configuration page and read by Risk Reporting.
//
// Axes: Likelihood % (vertical, fixed span 0-100) and Cost Impact
// (horizontal, 0 to the highest cost magnitude anywhere in the register,
// so the span tracks register edits). Cost Impact = Total Cost (Direct
// Cost + Knock On), the same quantity EMV is built from; opportunities
// (negative costs) are placed by magnitude.
import { expectedValue, totalCostRange } from "./workbook.js";
import { t, fmtInt } from "../i18n/i18n.js";

export const BIN_COUNT = 5;
export const LIKELIHOOD_MAX = 100;
const LIKELIHOOD_KEYS = ["rare", "unlikely", "possible", "likely", "almostCertain"];
const COST_KEYS = ["veryLow", "low", "medium", "high", "veryHigh"];

// Bin names (index 0..4), in the current UI language.
export function likelihoodLabel(i) {
  return t(`ram.likelihood.${LIKELIHOOD_KEYS[i]}`);
}
export function costLabel(i) {
  return t(`ram.cost.${COST_KEYS[i]}`);
}

// The 4 inner boundaries that split [0, max] into 5 equal bins.
export function equalThresholds(max) {
  return Array.from({ length: BIN_COUNT - 1 }, (_, i) => (max * (i + 1)) / BIN_COUNT);
}

// Stored shape: { likelihood: [t1..t4], cost: { mode: "equal" } |
// { mode: "custom", thresholds: [t1..t4] } }. Cost defaults to "equal",
// which re-splits the current span on every render — so the default
// setup keeps dividing equally as the register's highest cost changes.
// Custom cost thresholds are absolute amounts; only the top edge moves.
export function parseRamConfig(settings) {
  let raw = null;
  try {
    raw = settings?.ramJson ? JSON.parse(settings.ramJson) : null;
  } catch {
    raw = null;
  }
  const likelihood =
    Array.isArray(raw?.likelihood) && raw.likelihood.length === BIN_COUNT - 1
      ? raw.likelihood.map(Number)
      : equalThresholds(LIKELIHOOD_MAX);
  const cost =
    raw?.cost?.mode === "custom" && Array.isArray(raw.cost.thresholds) && raw.cost.thresholds.length === BIN_COUNT - 1
      ? { mode: "custom", thresholds: raw.cost.thresholds.map(Number) }
      : { mode: "equal" };
  return { likelihood, cost };
}

export function serializeRamConfig(config) {
  return JSON.stringify(config);
}

// Highest cost magnitude across every record's pre and post Total Cost
// range (min and max ends, so a large opportunity counts too).
export function costAxisMax(riskRecords) {
  let max = 0;
  for (const record of riskRecords) {
    for (const phase of ["pre", "post"]) {
      const assessment = record[phase];
      if (!assessment) continue;
      const range = totalCostRange(assessment);
      max = Math.max(max, Math.abs(range.min), Math.abs(range.max));
    }
  }
  return max;
}

// Strictly increasing, all strictly inside (0, max). Returns an error
// message, or null when valid.
export function validateThresholds(thresholds, max) {
  if (thresholds.length !== BIN_COUNT - 1 || thresholds.some((t) => !Number.isFinite(t))) {
    return t("ram.error.number");
  }
  const edges = [0, ...thresholds, max];
  for (let i = 1; i < edges.length; i++) {
    if (!(edges[i] > edges[i - 1])) {
      return t("ram.error.increasing", { max: fmtInt(max) });
    }
  }
  return null;
}

// Full 6-edge arrays [0, t1, t2, t3, t4, max] for both axes, plus the
// current cost span and whether custom cost thresholds have fallen out
// of it (e.g. the register's highest cost dropped below a boundary).
export function resolveBins(config, riskRecords) {
  const costMax = costAxisMax(riskRecords);
  const costThresholds = config.cost.mode === "custom" ? config.cost.thresholds : equalThresholds(costMax);
  return {
    likelihood: [0, ...config.likelihood, LIKELIHOOD_MAX],
    cost: [0, ...costThresholds, costMax],
    costMax,
    costMode: config.cost.mode,
    costOutOfRange: config.cost.mode === "custom" && validateThresholds(costThresholds, costMax) !== null,
  };
}

// Bin index 0..4 for a value against 6 edges. Lower edge inclusive,
// upper exclusive, except the last bin which also includes its top.
export function binIndex(value, edges) {
  for (let i = 1; i < edges.length - 1; i++) {
    if (value < edges[i]) return i - 1;
  }
  return edges.length - 2;
}

function isAssessed(dist) {
  return !!dist?.type;
}

// One point per record for the given phase: Likelihood EV (%) and Total
// Cost EV. Records without an assessed Likelihood and Direct Cost in
// that phase are returned separately as `unplotted`.
export function riskPoints(riskRecords, phase, edges) {
  const points = [];
  const unplotted = [];
  for (const record of riskRecords) {
    const a = record[phase];
    if (!a || !isAssessed(a.likelihood) || !isAssessed(a.costImpact)) {
      unplotted.push(record);
      continue;
    }
    const likelihood = expectedValue(a.likelihood);
    const cost = expectedValue(a.costImpact) + expectedValue(a.knockOn);
    const magnitude = Math.abs(cost);
    points.push({
      record,
      likelihood,
      cost,
      row: binIndex(likelihood, edges.likelihood),
      col: binIndex(magnitude, edges.cost),
    });
  }
  return { points, unplotted };
}

// Classic L x I score (1..25) banded low / medium / high.
export function cellSeverity(row, col) {
  const score = (row + 1) * (col + 1);
  if (score >= 15) return "high";
  if (score >= 5) return "medium";
  return "low";
}
