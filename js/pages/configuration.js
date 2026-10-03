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
  likelihoodLabel,
  LIKELIHOOD_MAX,
  costLabel,
  parseRamConfig,
  serializeRamConfig,
  resolveBins,
  equalThresholds,
  validateThresholds,
  riskPoints,
} from "../storage/ram.js";
import { renderRiskMatrix } from "../charts/risk-matrix.js";
import {
  REQUIRED_FIELD_GROUPS,
  ALWAYS_REQUIRED,
  DEFAULT_REQUIRED_FIELDS,
  parseRequiredFields,
  serializeRequiredFields,
} from "../storage/workbook.js";
import { t, tn, fmtInt, fmtNum, onLangChange } from "../i18n/i18n.js";

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

let lastState = null;

function render(state) {
  lastState = state;
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
          <button type="button" class="btn btn-ghost btn-sm" data-remove="${key}" data-id="${item.id}">${t("common.remove")}</button>
        </li>
      `
        )
        .join("") || `<li class="named-list-empty">${t("conf.noneYet")}</li>`;
  }

  renderRequiredFields(state);

  try {
    renderRam(state);
  } catch (err) {
    // Never leave the matrix silently blank — say so, and log the cause.
    console.error(err);
    const preview = document.querySelector("[data-ram-preview]");
    if (preview) preview.textContent = t("conf.ram.drawError");
  }
}

// --- Required fields of the risk record form --------------------------
function requiredFieldLabel(key) {
  if (!key.includes(".")) return t(`rr.field.${key}`);
  const dim = key.split(".")[1];
  return dim === "qhse" ? "QHSE" : t(`dim.${dim}`);
}

function renderRequiredFields(state) {
  const host = document.querySelector("[data-required-fields]");
  if (!host) return;
  const required = parseRequiredFields(state.settings);
  host.innerHTML = REQUIRED_FIELD_GROUPS.map(
    ({ group, keys }) => `
    <fieldset>
      <legend>${group === "details" ? t("rr.details") : t(`phase.${group}`)}</legend>
      ${keys
        .map((key) => {
          const locked = ALWAYS_REQUIRED.includes(key);
          return `<label class="inline-check">
            <input type="checkbox" data-required-key="${key}" ${required.has(key) ? "checked" : ""} ${locked ? "disabled" : ""}>
            ${escapeHtml(requiredFieldLabel(key))}${locked ? ` <span class="field-feedback" style="margin:0;">(${t("conf.required.always")})</span>` : ""}
          </label>`;
        })
        .join("")}
    </fieldset>`
  ).join("");
}

async function saveRequiredFields() {
  const keys = [...document.querySelectorAll("[data-required-key]")].filter((b) => b.checked).map((b) => b.dataset.requiredKey);
  await updateSettings({ requiredFieldsJson: serializeRequiredFields(new Set(keys)) });
}

// --- Risk Assessment Matrix bins -------------------------------------
let latestState = null;
const BIN_LABEL = { likelihood: likelihoodLabel, cost: costLabel };

function fmtEdge(axis, v) {
  if (!Number.isFinite(v)) return "—";
  return axis === "likelihood" ? `${fmtNum(v, 2)}%` : fmtInt(v);
}

// Table skeleton is built once per axis; later renders only update
// values, and never overwrite the input the user is typing in.
function ensureBinsTable(axis) {
  const table = document.querySelector(`[data-ram-bins="${axis}"]`);
  if (!table || table.dataset.built) return table;
  table.dataset.built = "1";
  const step = axis === "likelihood" ? "0.1" : "any";
  table.innerHTML = `
    <thead><tr><th>${t("conf.ram.bin")}</th><th>${t("conf.ram.from")}</th><th>${t("conf.ram.to")}</th></tr></thead>
    <tbody>
      ${Array.from({ length: BIN_COUNT }, (_, i) => BIN_LABEL[axis](i))
        .map(
          (label, i) => `
        <tr>
          <td>${i + 1}. ${label}</td>
          <td data-ram-from="${i}"></td>
          <td>${
            i < BIN_COUNT - 1
              ? `<input type="number" step="${step}" min="0" data-ram-threshold="${axis}" data-index="${i}" aria-label="${t("conf.ram.upperBound", { bin: label })}">`
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
    table.querySelector("[data-ram-top]").textContent = t("conf.ram.top", { value: fmtEdge(axis, edges[BIN_COUNT]) });
    table.querySelectorAll("[data-ram-threshold]").forEach((input) => {
      if (document.activeElement === input) return;
      const v = edges[Number(input.dataset.index) + 1];
      input.value = axis === "cost" && bins.costMode === "equal" ? Math.round(v) : v;
    });
  }

  section.querySelector("[data-ram-intro]").textContent = t("conf.ram.intro", {
    costMax: bins.costMax > 0 ? t("conf.ram.costMaxCurrent", { value: fmtEdge("cost", bins.costMax) }) : t("conf.ram.costMaxNone"),
  });
  section.querySelector("[data-ram-cost-mode]").textContent =
    bins.costMode === "equal" ? t("conf.ram.modeEqual") : t("conf.ram.modeCustom");

  const errorBox = section.querySelector("[data-ram-error]");
  if (bins.costOutOfRange && !errorBox.dataset.inputError) {
    errorBox.textContent = t("conf.ram.outOfRange", { value: fmtEdge("cost", bins.costMax) });
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
    ? tn("conf.ram.previewNote", state.riskRecords.length, { shown: fmtInt(points.length) })
    : t("conf.ram.previewEmpty");
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
    errorBox.textContent = t("conf.ram.inputError", { axis: t(axis === "likelihood" ? "dim.likelihood" : "rep.ram.costImpact"), error });
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
    if (event.target.closest("[data-required-key]")) saveRequiredFields();
  });
  document.querySelector("[data-required-reset]")?.addEventListener("click", () =>
    updateSettings({ requiredFieldsJson: serializeRequiredFields(new Set(DEFAULT_REQUIRED_FIELDS)) })
  );

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
onLangChange(() => {
  // Bin tables are built once; rebuild them with the new labels.
  document.querySelectorAll("[data-ram-bins]").forEach((table) => delete table.dataset.built);
  if (lastState) render(lastState);
});
wire();
