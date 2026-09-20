// Monte Carlo simulation over the Total Cost of "Regular Pooled Record"
// risk records. Pure functions, no DOM/storage — testable in isolation.
//
// Per trial, per pooled record: Likelihood is itself sampled from its own
// distribution (it may be a range, not just a point), then compared
// against a fresh uniform draw to decide whether the risk "occurs" that
// trial (the standard probability-impact Monte Carlo approach for a risk
// register). If it occurs, Direct Cost and Knock On are independently
// sampled and summed into that trial's portfolio total.

function sampleDistribution(dist, rng) {
  if (!dist || !dist.type) return 0;
  const u = rng();
  if (dist.type === "single-point") return dist.ml ?? 0;
  if (dist.type === "uniform") {
    const { min, max } = dist;
    return min + u * (max - min);
  }
  if (dist.type === "triangular") {
    const { min, ml, max } = dist;
    const c = (ml - min) / (max - min);
    if (u < c) return min + Math.sqrt(u * (max - min) * (ml - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - ml));
  }
  return 0;
}

export function pooledRecords(riskRecords) {
  return riskRecords.filter((r) => r.recordType === "Regular Pooled Record");
}

// rng is injectable so results are reproducible in tests; defaults to
// Math.random for real runs.
export function runMonteCarlo({ records, phase, trials, rng = Math.random }) {
  const pooled = pooledRecords(records);
  const totals = new Array(trials);

  for (let t = 0; t < trials; t++) {
    let sum = 0;
    for (const record of pooled) {
      const assessment = record[phase];
      if (!assessment) continue;
      const likelihoodPct = sampleDistribution(assessment.likelihood, rng);
      const occurs = rng() * 100 < likelihoodPct;
      if (occurs) {
        sum +=
          sampleDistribution(assessment.costImpact, rng) +
          sampleDistribution(assessment.knockOn, rng);
      }
    }
    totals[t] = sum;
  }

  totals.sort((a, b) => a - b);
  return totals;
}

export function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const idx = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const frac = idx - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

// Min, P05..P50 in steps of 5, and Max — exactly the table the user asked
// for. (P50 = median; results above the median aren't requested since
// contingency planning here reads up to the 50th percentile threshold.)
export const PERCENTILE_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function summarize(sortedValues) {
  const percentiles = {};
  for (const p of PERCENTILE_STEPS) {
    percentiles[`P${String(p).padStart(2, "0")}`] = percentile(sortedValues, p);
  }
  return {
    trials: sortedValues.length,
    min: sortedValues[0] ?? 0,
    max: sortedValues[sortedValues.length - 1] ?? 0,
    percentiles,
  };
}

// Bins sortedValues into `binCount` equal-width bins across an explicit
// [domainMin, domainMax] range (rather than each series' own min/max) so
// two series (e.g. pre- and post-mitigation) can be binned onto the same
// x-axis and overlaid meaningfully.
export function histogram(sortedValues, binCount, domainMin, domainMax) {
  const span = domainMax - domainMin || 1;
  const binWidth = span / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: domainMin + i * binWidth,
    binEnd: domainMin + (i + 1) * binWidth,
    count: 0,
  }));
  for (const v of sortedValues) {
    let idx = Math.floor((v - domainMin) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values, meanValue) {
  if (values.length < 2) return 0;
  const m = meanValue ?? mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Gaussian PDF, used to draw the "bell curve" overlaid on the histogram.
// The result is a density, not a count — callers scale it by
// (trials * binWidth) to match the histogram's count scale.
export function normalPdf(x, meanValue, stdevValue) {
  if (stdevValue <= 0) return x === meanValue ? Infinity : 0;
  const coeff = 1 / (stdevValue * Math.sqrt(2 * Math.PI));
  const exponent = -((x - meanValue) ** 2) / (2 * stdevValue ** 2);
  return coeff * Math.exp(exponent);
}

// Evenly-subsampled points for the S-curve, so a 10k-trial run doesn't
// render 10k SVG points. Always includes the true min and max.
export function curvePoints(sortedValues, maxPoints = 200) {
  const n = sortedValues.length;
  if (n === 0) return [];
  if (n <= maxPoints) {
    return sortedValues.map((value, i) => ({
      value,
      cumulative: (i / (n - 1 || 1)) * 100,
    }));
  }
  const step = (n - 1) / (maxPoints - 1);
  const points = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    points.push({ value: sortedValues[idx], cumulative: (idx / (n - 1)) * 100 });
  }
  return points;
}
