import {
  onRegisterChange,
  applyConfigTemplate,
  rbsList,
  impactAreaList,
  ownerList,
  qhseLevelList,
  updateSettings,
} from "../storage/register-store.js";
import {
  BIN_COUNT,
  LIKELIHOOD_LABELS,
  LIKELIHOOD_MAX,
  COST_LABELS,
  parseRamConfig,
  serializeRamConfig,
  resolveBins,
  equalThresholds,
  validateThresholds,
  riskPoints,
} from "../storage/ram.js";
import { renderRiskMatrix } from "../charts/risk-matrix.js";

const LISTS = {
  rbs: rbsList,
  impactAreas: impactAreaList,
  owners: ownerList,
  qhseLevels: qhseLevelList,
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function render(state) {
  const emptyState = document.querySelector("[data-config-empty-state]");
  const content = document.querySelector("[data-config-content]");
  const isEmpty =
    state.rbs.length === 0 &&
    state.impactAreas.length === 0 &&
    state.owners.length === 0 &&
    state.qhseLevels.length === 0;
  const ready = state.status === "ready";

  if (emptyState) emptyState.hidden = !ready || !isEmpty;
  if (content) content.hidden = !ready || isEmpty;
  if (!ready) return;

  for (const key of Object.keys(LISTS)) {
    const ul = document.querySelector(`[data-list="${key}"]`);
    if (!ul) continue;
    ul.innerHTML =
      state[key]
        .map(
          (item) => `
        <li class="named-list-item">
          <span>${escapeHtml(item.name)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-remove="${key}" data-id="${item.id}">Remove</button>
        </li>
      `
        )
        .join("") || `<li class="named-list-empty">None yet.</li>`;
  }

  try {
    renderRam(state);
  } catch (err) {
    // Never leave the matrix silently blank — say so, and log the cause.
    console.error(err);
    const preview = document.querySelector("[data-ram-preview]");
    if (preview) preview.textContent = "The matrix couldn't be drawn — try reloading the page (Ctrl+F5).";
  }
}

// --- Risk Assessment Matrix bins -------------------------------------
let latestState = null;
const BIN_LABELS = { likelihood: LIKELIHOOD_LABELS, cost: COST_LABELS };

function fmtEdge(axis, v) {
  if (!Number.isFinite(v)) return "—";
  return axis === "likelihood"
    ? `${Number(v.toFixed(2))}%`
    : v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Table skeleton is built once per axis; later renders only update
// values, and never overwrite the input the user is typing in.
function ensureBinsTable(axis) {
  const table = document.querySelector(`[data-ram-bins="${axis}"]`);
  if (!table || table.dataset.built) return table;
  table.dataset.built = "1";
  const step = axis === "likelihood" ? "0.1" : "any";
  table.innerHTML = `
    <thead><tr><th>Bin</th><th>From</th><th>To</th></tr></thead>
    <tbody>
      ${BIN_LABELS[axis]
        .map(
          (label, i) => `
        <tr>
          <td>${i + 1}. ${label}</td>
          <td data-ram-from="${i}"></td>
          <td>${
            i < BIN_COUNT - 1
              ? `<input type="number" step="${step}" min="0" data-ram-threshold="${axis}" data-index="${i}" aria-label="${label} upper bound">`
              : `<span data-ram-top></span>`
          }</td>
        </tr>`
        )
        .join("")}
    </tbody>
  `;
  return table;
}

function renderRam(state) {
  latestState = state;
  const section = document.querySelector("[data-ram-config]");
  if (!section) return;
  const config = parseRamConfig(state.settings);
  const bins = resolveBins(config, state.riskRecords);

  for (const axis of ["likelihood", "cost"]) {
    const table = ensureBinsTable(axis);
    const edges = bins[axis];
    table.querySelectorAll("[data-ram-from]").forEach((td) => {
      td.textContent = fmtEdge(axis, edges[Number(td.dataset.ramFrom)]);
    });
    table.querySelector("[data-ram-top]").textContent = `${fmtEdge(axis, edges[BIN_COUNT])} (max)`;
    table.querySelectorAll("[data-ram-threshold]").forEach((input) => {
      if (document.activeElement === input) return;
      const v = edges[Number(input.dataset.index) + 1];
      input.value = axis === "cost" && bins.costMode === "equal" ? Math.round(v) : v;
    });
  }

  section.querySelector("[data-ram-cost-max]").textContent =
    bins.costMax > 0 ? `currently ${fmtEdge("cost", bins.costMax)}` : "no risk record costs yet";
  section.querySelector("[data-ram-cost-mode]").textContent =
    bins.costMode === "equal"
      ? "Equal bins: re-divided automatically whenever the highest cost in the register changes."
      : "Custom bins: your boundaries stay fixed; only the top of the last bin follows the register's highest cost.";

  const errorBox = section.querySelector("[data-ram-error]");
  if (bins.costOutOfRange && !errorBox.dataset.inputError) {
    errorBox.textContent = `The register's highest cost (${fmtEdge("cost", bins.costMax)}) is now at or below one of your custom Cost Impact boundaries, so some bins are empty ranges. Adjust the boundaries or reset to equal bins.`;
    errorBox.hidden = false;
  } else if (!errorBox.dataset.inputError) {
    errorBox.hidden = true;
  }

  // Preview shows every risk at its pre-mitigation position, so the
  // effect of a bin change is visible immediately (Risk Reporting has
  // the filters and the post-mitigation view).
  const { points } = riskPoints(state.riskRecords, "pre", bins);
  renderRiskMatrix(section.querySelector("[data-ram-preview]"), bins, points);
  section.querySelector("[data-ram-preview-note]").textContent = state.riskRecords.length
    ? `${points.length} of ${state.riskRecords.length} risk record${state.riskRecords.length === 1 ? "" : "s"} shown at their pre-mitigation position.`
    : "No risk records yet — the grid shows the configured bins; risks appear here once added in the Risk Register.";
}

async function saveThresholds(axis) {
  if (!latestState) return;
  const section = document.querySelector("[data-ram-config]");
  const errorBox = section.querySelector("[data-ram-error]");
  const inputs = [...section.querySelectorAll(`[data-ram-threshold="${axis}"]`)];
  const thresholds = inputs.map((i) => (i.value === "" ? NaN : Number(i.value)));
  const config = parseRamConfig(latestState.settings);
  const max = axis === "likelihood" ? LIKELIHOOD_MAX : resolveBins(config, latestState.riskRecords).costMax;
  const error = validateThresholds(thresholds, max);
  if (error) {
    errorBox.textContent = `${axis === "likelihood" ? "Likelihood" : "Cost Impact"}: ${error} Not saved yet.`;
    errorBox.dataset.inputError = "1";
    errorBox.hidden = false;
    return;
  }
  delete errorBox.dataset.inputError;
  errorBox.hidden = true;
  if (axis === "likelihood") config.likelihood = thresholds;
  else config.cost = { mode: "custom", thresholds };
  await updateSettings({ ramJson: serializeRamConfig(config) });
}

async function resetThresholds(axis) {
  if (!latestState) return;
  const config = parseRamConfig(latestState.settings);
  if (axis === "likelihood") config.likelihood = equalThresholds(LIKELIHOOD_MAX);
  else config.cost = { mode: "equal" };
  const errorBox = document.querySelector("[data-ram-error]");
  delete errorBox.dataset.inputError;
  errorBox.hidden = true;
  await updateSettings({ ramJson: serializeRamConfig(config) });
}

function wire() {
  document
    .querySelector("[data-load-config-template]")
    ?.addEventListener("click", async () => {
      await applyConfigTemplate();
    });

  document.querySelectorAll("[data-add-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const key = form.dataset.addForm;
      const input = form.querySelector('input[name="name"]');
      const value = input.value.trim();
      if (!value) return;
      await LISTS[key].add(value);
      input.value = "";
      input.focus();
    });
  });

  document.body.addEventListener("change", (event) => {
    const input = event.target.closest("[data-ram-threshold]");
    if (input) saveThresholds(input.dataset.ramThreshold);
  });

  document.body.addEventListener("click", (event) => {
    const reset = event.target.closest("[data-ram-reset]");
    if (reset) resetThresholds(reset.dataset.ramReset);
  });

  document.body.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-remove]");
    if (!btn) return;
    await LISTS[btn.dataset.remove].remove(btn.dataset.id);
  });
}

onRegisterChange(render);
wire();
