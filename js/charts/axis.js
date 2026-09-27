// Shared axis helpers for the SVG charts.

// Evenly spaced "round" axis values (1/2/5 x 10^n steps) across [lo, hi].
export function niceTicks(lo, hi, count) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

// Rounds `hi` up to the next nice step, so an axis ends on a labelled tick.
export function niceMax(hi, count) {
  if (!(hi > 0)) return 1;
  const ticks = niceTicks(0, hi, count);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : hi;
  return Math.ceil(hi / step - 1e-9) * step;
}
