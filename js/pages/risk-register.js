import {
  getRegisterState,
  onRegisterChange,
  saveRiskRecord,
  deleteRiskRecord,
  loadRiskRecordTemplate,
  blankRiskRecord,
  createLocalAction,
  validateDistribution,
  calculateAssessment,
  totalCostRange,
  expectedValue,
  DIMENSIONS,
} from "../storage/register-store.js";
import { RECORD_TYPES } from "../storage/workbook.js";

const DIMENSION_LABELS = {
  likelihood: "Likelihood",
  costImpact: "Direct Cost",
  knockOn: "Knock On",
  scheduleImpact: "Schedule",
};
const DIMENSION_UNITS = {
  likelihood: "%, 1–100",
  costImpact: "currency",
  knockOn: "currency, indirect/downstream cost",
  scheduleImpact: "days",
};
const DIMENSION_BOUNDS = { likelihood: { min: 1, max: 100 } };
// Required in Pre-mitigation: a risk isn't really assessed without these.
// Knock On and every Post-mitigation group are optional (a new risk may
// not have mitigation assessed yet, or no knock-on effect at all).
const REQUIRED_GROUPS = new Set(["pre:likelihood", "pre:costImpact", "pre:scheduleImpact"]);

const STRATEGIES = {
  Threat: ["Eliminate", "Mitigate", "Transfer", "Monitor/Accept"],
  Opportunity: ["Exploit", "Enhance", "Share", "Monitor/Accept"],
};

let draft = null;
let currentState = getRegisterState();
let viewMode = "emv"; // emv | cost | schedule | qhse
let sortState = { key: null, direction: "asc" };

const VIEW_MODES = [
  { key: "emv", label: "EMV" },
  { key: "cost", label: "Cost" },
  { key: "schedule", label: "Schedule" },
  { key: "qhse", label: "QHSE" },
];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function fmtNumber(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function els() {
  return {
    listView: document.querySelector('[data-view="list"]'),
    formView: document.querySelector('[data-view="form"]'),
    recordsBody: document.querySelector("[data-records-body]"),
    recordsTable: document.querySelector("[data-records-table]"),
    recordsEmpty: document.querySelector("[data-records-empty]"),
    form: document.querySelector("[data-record-form]"),
    assessmentSections: document.querySelector("[data-assessment-sections]"),
    actionsList: document.querySelector("[data-actions-list]"),
  };
}

// --- List view ----------------------------------------------------------
const BASE_COLUMNS = [
  { key: "id", label: "ID", sort: (r) => r.id, render: (r) => escapeHtml(r.id) },
  { key: "title", label: "Title", sort: (r) => r.title.toLowerCase(), render: (r) => escapeHtml(r.title) },
  {
    key: "riskType",
    label: "Type",
    sort: (r) => r.riskType,
    render: (r) => `<span class="badge ${r.riskType === "Threat" ? "badge-high" : "badge-low"}">${escapeHtml(r.riskType)}</span>`,
  },
  { key: "recordType", label: "Record Type", sort: (r) => r.recordType, render: (r) => escapeHtml(r.recordType) },
  { key: "impactArea", label: "Impact Area", sort: (r) => r.impactArea, render: (r) => escapeHtml(r.impactArea) },
  { key: "owner", label: "Owner", sort: (r) => r.owner, render: (r) => escapeHtml(r.owner) },
];

function likelihoodColumns() {
  return [
    {
      key: "preLikelihood",
      label: "Pre Likelihood",
      highlight: true,
      sort: (r) => expectedValue(r.pre.likelihood),
      render: (r) => `${fmtNumber(expectedValue(r.pre.likelihood))}%`,
    },
    {
      key: "postLikelihood",
      label: "Post Likelihood",
      highlight: true,
      sort: (r) => expectedValue(r.post.likelihood),
      render: (r) => `${fmtNumber(expectedValue(r.post.likelihood))}%`,
    },
  ];
}

function modeColumns(mode) {
  if (mode === "cost") {
    return [
      ...likelihoodColumns(),
      { key: "preCostMin", label: "Pre Min", highlight: true, sort: (r) => totalCostRange(r.pre).min, render: (r) => fmtNumber(totalCostRange(r.pre).min) },
      { key: "preCostMl", label: "Pre ML", highlight: true, sort: (r) => totalCostRange(r.pre).ev, render: (r) => fmtNumber(totalCostRange(r.pre).ev) },
      { key: "preCostMax", label: "Pre Max", highlight: true, sort: (r) => totalCostRange(r.pre).max, render: (r) => fmtNumber(totalCostRange(r.pre).max) },
      { key: "postCostMin", label: "Post Min", highlight: true, sort: (r) => totalCostRange(r.post).min, render: (r) => fmtNumber(totalCostRange(r.post).min) },
      { key: "postCostMl", label: "Post ML", highlight: true, sort: (r) => totalCostRange(r.post).ev, render: (r) => fmtNumber(totalCostRange(r.post).ev) },
      { key: "postCostMax", label: "Post Max", highlight: true, sort: (r) => totalCostRange(r.post).max, render: (r) => fmtNumber(totalCostRange(r.post).max) },
    ];
  }
  if (mode === "schedule") {
    const dashOr = (v) => (v == null ? "—" : fmtNumber(v));
    return [
      ...likelihoodColumns(),
      { key: "preSchedMin", label: "Pre Min", highlight: true, sort: (r) => r.pre.scheduleImpact.min ?? -Infinity, render: (r) => dashOr(r.pre.scheduleImpact.min) },
      { key: "preSchedMl", label: "Pre ML", highlight: true, sort: (r) => r.pre.scheduleImpact.ml ?? -Infinity, render: (r) => dashOr(r.pre.scheduleImpact.ml) },
      { key: "preSchedMax", label: "Pre Max", highlight: true, sort: (r) => r.pre.scheduleImpact.max ?? -Infinity, render: (r) => dashOr(r.pre.scheduleImpact.max) },
      { key: "postSchedMin", label: "Post Min", highlight: true, sort: (r) => r.post.scheduleImpact.min ?? -Infinity, render: (r) => dashOr(r.post.scheduleImpact.min) },
      { key: "postSchedMl", label: "Post ML", highlight: true, sort: (r) => r.post.scheduleImpact.ml ?? -Infinity, render: (r) => dashOr(r.post.scheduleImpact.ml) },
      { key: "postSchedMax", label: "Post Max", highlight: true, sort: (r) => r.post.scheduleImpact.max ?? -Infinity, render: (r) => dashOr(r.post.scheduleImpact.max) },
    ];
  }
  if (mode === "qhse") {
    return [
      ...likelihoodColumns(),
      { key: "preQhse", label: "Pre QHSE", highlight: true, sort: (r) => r.pre.qhse ?? "", render: (r) => escapeHtml(r.pre.qhse ?? "—") },
      { key: "postQhse", label: "Post QHSE", highlight: true, sort: (r) => r.post.qhse ?? "", render: (r) => escapeHtml(r.post.qhse ?? "—") },
    ];
  }
  // emv (default)
  return [
    { key: "preEmv", label: "Pre EMV", highlight: true, sort: (r) => r.computed.pre.emv, render: (r) => fmtNumber(r.computed.pre.emv) },
    { key: "postEmv", label: "Post EMV", highlight: true, sort: (r) => r.computed.post.emv, render: (r) => fmtNumber(r.computed.post.emv) },
  ];
}

function currentColumns() {
  return [...BASE_COLUMNS, ...modeColumns(viewMode)];
}

function sortedRecords() {
  const records = [...currentState.riskRecords];
  if (!sortState.key) return records;
  const col = currentColumns().find((c) => c.key === sortState.key);
  if (!col) return records;
  const dir = sortState.direction === "asc" ? 1 : -1;
  return records.sort((a, b) => {
    const va = col.sort(a);
    const vb = col.sort(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function renderModeToggle() {
  const el = document.querySelector("[data-view-mode-toggle]");
  if (!el) return;
  el.innerHTML = VIEW_MODES.map(
    (m) =>
      `<button type="button" class="btn btn-sm ${viewMode === m.key ? "btn-primary" : "btn-secondary"}" data-view-mode="${m.key}">${m.label}</button>`
  ).join("");
}

function renderTableHead() {
  const thead = document.querySelector("[data-records-thead]");
  if (!thead) return;
  const columns = currentColumns();
  thead.innerHTML = `
    <tr>
      ${columns
        .map((col) => {
          const isSorted = sortState.key === col.key;
          const arrow = isSorted ? (sortState.direction === "asc" ? " ▲" : " ▼") : "";
          return `<th class="${col.highlight ? "col-highlight" : ""}" data-sort-key="${col.key}" tabindex="0" role="button" aria-sort="${isSorted ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">${escapeHtml(col.label)}${arrow}</th>`;
        })
        .join("")}
      <th></th>
    </tr>
  `;
}

function renderTableBody() {
  const { recordsBody, recordsTable, recordsEmpty } = els();
  if (!recordsBody) return;
  const records = sortedRecords();

  if (recordsEmpty) recordsEmpty.hidden = records.length > 0;
  if (recordsTable) recordsTable.hidden = records.length === 0;

  const columns = currentColumns();
  recordsBody.innerHTML = records
    .map(
      (r) => `
    <tr data-row-id="${r.id}">
      ${columns.map((col) => `<td class="${col.highlight ? "col-highlight" : ""}">${col.render(r)}</td>`).join("")}
      <td style="white-space:nowrap;">
        <button type="button" class="btn btn-ghost btn-sm" data-duplicate-record="${r.id}">Duplicate</button>
        <button type="button" class="btn btn-ghost btn-sm" data-delete-record="${r.id}">Delete</button>
      </td>
    </tr>
  `
    )
    .join("");
}

function renderList() {
  renderModeToggle();
  renderTableHead();
  renderTableBody();
}

// --- Options for selects --------------------------------------------------
// `value` is the value the select should end up showing. If it doesn't
// match any configured item (e.g. a record's owner was later removed from
// the Owners list, or a loaded template references a name not yet in the
// config), it's still added as an extra option — never silently dropped,
// since that would look like the data itself was lost.
function populateOptions(select, items, placeholder, value) {
  const options = items.map((i) => i.name);
  if (value && !options.includes(value)) options.push(value);
  select.innerHTML =
    `<option value="">${placeholder}</option>` +
    options.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  select.value = value ?? "";
}

// --- Assessment (distribution) groups -------------------------------------
function distGroupHtml(phase, dim) {
  const key = `${phase}:${dim}`;
  const required = REQUIRED_GROUPS.has(key);
  const showsMax = dim === "costImpact" || dim === "knockOn" || dim === "scheduleImpact";
  return `
    <div class="dist-group" data-phase="${phase}" data-dim="${dim}">
      <div class="dist-group-header">
        <h4>${DIMENSION_LABELS[dim]}${required ? " *" : ""}</h4>
        <span class="dist-group-unit">${DIMENSION_UNITS[dim]}</span>
      </div>
      <div class="dist-inputs">
        <label>Min<input type="number" step="any" data-cell="min"></label>
        <label>Most Likely<input type="number" step="any" data-cell="ml"></label>
        <label>Max<input type="number" step="any" data-cell="max"></label>
      </div>
      <div class="dist-feedback" data-feedback></div>
      ${showsMax ? `<div class="dist-computed" data-computed></div>` : ""}
    </div>
  `;
}

function qhseGroupHtml(phase) {
  return `
    <div class="qhse-group" data-phase="${phase}">
      <div class="dist-group-header">
        <h4>QHSE</h4>
        <span class="dist-group-unit">qualitative</span>
      </div>
      <select data-qhse-select></select>
    </div>
  `;
}

function assessmentSectionHtml(phase) {
  const title = phase === "pre" ? "Pre-mitigation assessment" : "Post-mitigation assessment";
  const hint =
    phase === "pre"
      ? "Enter Most Likely only for a single point, Min &amp; Max only for a uniform range, or Min, Most Likely &amp; Max for a triangular range."
      : "Optional — leave blank until a response has been assessed.";
  return `
    <div class="card" style="margin-bottom: var(--space-5);" data-assessment-phase="${phase}">
      <h3>${title}</h3>
      <p>${hint}</p>

      ${distGroupHtml(phase, "likelihood")}

      <div class="total-cost-block">
        <div class="dist-group-header">
          <h4>Total Cost</h4>
          <span class="dist-group-unit">Direct Cost + Knock On, computed</span>
        </div>
        <div class="assessment-summary">
          <div class="stat-tile">
            <div class="stat-label">Min</div>
            <div class="stat-value" data-total-cost="min">—</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Expected</div>
            <div class="stat-value" data-total-cost="ev">—</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Max</div>
            <div class="stat-value" data-total-cost="max">—</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">EMV</div>
            <div class="stat-value" data-summary="emv">—</div>
          </div>
        </div>

        <div class="indented-group">
          ${distGroupHtml(phase, "costImpact")}
          ${distGroupHtml(phase, "knockOn")}
        </div>
      </div>

      <div class="secondary-assessments-box">
        ${distGroupHtml(phase, "scheduleImpact")}
        ${qhseGroupHtml(phase)}
      </div>
    </div>
  `;
}

function readCell(input) {
  const v = input.value.trim();
  return v === "" ? null : Number(v);
}

function updateDistGroup(groupEl) {
  const phase = groupEl.dataset.phase;
  const dim = groupEl.dataset.dim;
  const min = readCell(groupEl.querySelector('[data-cell="min"]'));
  const ml = readCell(groupEl.querySelector('[data-cell="ml"]'));
  const max = readCell(groupEl.querySelector('[data-cell="max"]'));
  const result = validateDistribution({ min, ml, max }, DIMENSION_BOUNDS[dim]);
  const key = `${phase}:${dim}`;
  const required = REQUIRED_GROUPS.has(key);

  draft[phase][dim] = { min, ml, max, type: result.valid ? result.type : null };

  const feedback = groupEl.querySelector("[data-feedback]");
  if (result.empty) {
    feedback.textContent = required ? "Required." : "";
    feedback.removeAttribute("data-valid");
  } else if (result.valid) {
    const label = { "single-point": "Single point", uniform: "Uniform", triangular: "Triangular" }[result.type];
    feedback.textContent = label;
    feedback.dataset.valid = "true";
  } else {
    feedback.textContent = result.message;
    feedback.dataset.valid = "false";
  }

  const computedEl = groupEl.querySelector("[data-computed]");
  if (computedEl) {
    const computed = calculateAssessment(draft[phase]);
    if (dim === "costImpact") computedEl.textContent = `Max Direct Cost: ${fmtNumber(computed.maxDirectCost)}`;
    if (dim === "knockOn") computedEl.textContent = `Max Knock On: ${fmtNumber(computed.maxKnockOn)}`;
    if (dim === "scheduleImpact")
      computedEl.textContent = `Max Schedule: ${fmtNumber(computed.maxSchedule)} · Schedule Exposure: ${fmtNumber(computed.scheduleExposure)}`;
  }

  updateSummary(phase);
}

function updateSummary(phase) {
  const section = document.querySelector(`[data-assessment-phase="${phase}"]`);
  if (!section) return;
  const computed = calculateAssessment(draft[phase]);
  const range = totalCostRange(draft[phase]);
  section.querySelector('[data-summary="emv"]').textContent = fmtNumber(computed.emv);
  section.querySelector('[data-total-cost="min"]').textContent = fmtNumber(range.min);
  section.querySelector('[data-total-cost="ev"]').textContent = fmtNumber(range.ev);
  section.querySelector('[data-total-cost="max"]').textContent = fmtNumber(range.max);
}

function fillDistGroup(groupEl, dist) {
  groupEl.querySelector('[data-cell="min"]').value = dist?.min ?? "";
  groupEl.querySelector('[data-cell="ml"]').value = dist?.ml ?? "";
  groupEl.querySelector('[data-cell="max"]').value = dist?.max ?? "";
  updateDistGroup(groupEl);
}

function fillQhseGroup(phase) {
  const groupEl = document.querySelector(`.qhse-group[data-phase="${phase}"]`);
  if (!groupEl) return;
  const select = groupEl.querySelector("[data-qhse-select]");
  populateOptions(select, currentState.qhseLevels, "Select QHSE level…", draft[phase].qhse);
  select.addEventListener("change", () => {
    draft[phase].qhse = select.value || null;
  });
}

// --- Response actions ------------------------------------------------
function actionRowHtml(action) {
  const strategies = STRATEGIES[draft.riskType] ?? STRATEGIES.Threat;
  return `
    <div class="action-row" data-action-id="${action.id}">
      <div><label>Action Title</label><input type="text" data-action-field="title" value="${escapeHtml(action.title)}"></div>
      <div><label>Action Owner</label>
        <select data-action-field="owner" data-options="owners"></select>
      </div>
      <div><label>Strategy</label>
        <select data-action-field="strategy">
          <option value="">Select…</option>
          ${strategies.map((s) => `<option value="${s}" ${action.strategy === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div><label>Due Date</label><input type="date" data-action-field="dueDate" value="${escapeHtml(action.dueDate)}"></div>
      <div><label>Cost</label><input type="number" step="any" data-action-field="cost" value="${action.cost ?? 0}"></div>
      <div><button type="button" class="btn btn-ghost btn-sm" data-remove-action="${action.id}">Remove</button></div>
    </div>
  `;
}

function renderActions() {
  const { actionsList } = els();
  if (!actionsList) return;
  actionsList.innerHTML = draft.actions.length
    ? draft.actions.map(actionRowHtml).join("")
    : `<p style="color: var(--color-text-subtle); font-size: 0.85rem;">No response actions yet.</p>`;

  actionsList.querySelectorAll("[data-action-field]").forEach((input) => {
    const row = input.closest("[data-action-id]");
    const id = row.dataset.actionId;
    if (input.dataset.actionField === "owner") {
      const action = draft.actions.find((a) => a.id === id);
      populateOptions(input, currentState.owners, "Select owner…", action?.owner);
    }
    input.addEventListener("input", () => {
      const action = draft.actions.find((a) => a.id === id);
      if (!action) return;
      const field = input.dataset.actionField;
      action[field] = field === "cost" ? Number(input.value || 0) : input.value;
    });
  });

  actionsList.querySelectorAll("[data-remove-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.actions = draft.actions.filter((a) => a.id !== btn.dataset.removeAction);
      renderActions();
    });
  });
}

// --- Form view ------------------------------------------------------
function buildAssessmentSections() {
  const { assessmentSections } = els();
  assessmentSections.innerHTML = ["pre", "post"].map(assessmentSectionHtml).join("");
  assessmentSections.querySelectorAll(".dist-group").forEach((groupEl) => {
    groupEl.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => updateDistGroup(groupEl));
    });
  });
}

function renderForm() {
  const { form, formView, listView } = els();
  listView.hidden = true;
  formView.hidden = false;

  form.querySelector('[data-field="title"]').value = draft.title;
  form.querySelector('[data-field="riskType"]').value = draft.riskType;
  form.querySelector('[data-field="recordType"]').value = draft.recordType;
  form.querySelector('[data-field="description"]').value = draft.description;
  form.querySelector('[data-field="cause"]').value = draft.cause;
  form.querySelector('[data-field="effect"]').value = draft.effect;

  populateOptions(form.querySelector('[data-field="owner"]'), currentState.owners, "Select owner…", draft.owner);
  populateOptions(form.querySelector('[data-field="impactArea"]'), currentState.impactAreas, "Select impact area…", draft.impactArea);
  populateOptions(form.querySelector('[data-field="rbsCategory"]'), currentState.rbs, "Select RBS category…", draft.rbsCategory);

  buildAssessmentSections();
  for (const phase of ["pre", "post"]) {
    for (const dim of DIMENSIONS) {
      const groupEl = document.querySelector(`.dist-group[data-phase="${phase}"][data-dim="${dim}"]`);
      fillDistGroup(groupEl, draft[phase][dim]);
    }
    fillQhseGroup(phase);
  }

  renderActions();
}

function showList() {
  const { formView, listView } = els();
  formView.hidden = true;
  listView.hidden = false;
  draft = null;
  renderList();
}

function startNewRecord() {
  draft = blankRiskRecord();
  renderForm();
}

function startEditRecord(id) {
  const record = currentState.riskRecords.find((r) => r.id === id);
  if (!record) return;
  draft = JSON.parse(JSON.stringify(record));
  renderForm();
}

// Opens the form pre-filled from an existing record, but as a brand new
// unsaved record (id cleared) — saving creates a separate row rather
// than overwriting the original. Response actions get fresh local ids
// too, so they don't collide with the original record's Actions rows.
function duplicateRecord(id) {
  const record = currentState.riskRecords.find((r) => r.id === id);
  if (!record) return;
  draft = JSON.parse(JSON.stringify(record));
  draft.id = null;
  draft.title = `${draft.title} (Copy)`;
  draft.createdAt = "";
  draft.updatedAt = "";
  draft.actions = draft.actions.map((a) => ({ ...a, id: createLocalAction().id }));
  renderForm();
}

function formHasErrors() {
  return !!document.querySelector('.dist-feedback[data-valid="false"]');
}

function requiredGroupsMissing() {
  return [...REQUIRED_GROUPS].some((key) => {
    const [phase, dim] = key.split(":");
    const d = draft[phase][dim];
    return d.ml === null && d.min === null && d.max === null;
  });
}

async function submitForm(event) {
  event.preventDefault();
  const { form } = els();
  draft.title = form.querySelector('[data-field="title"]').value.trim();
  draft.riskType = form.querySelector('[data-field="riskType"]').value;
  draft.recordType = form.querySelector('[data-field="recordType"]').value;
  draft.description = form.querySelector('[data-field="description"]').value;
  draft.cause = form.querySelector('[data-field="cause"]').value;
  draft.effect = form.querySelector('[data-field="effect"]').value;
  draft.owner = form.querySelector('[data-field="owner"]').value;
  draft.impactArea = form.querySelector('[data-field="impactArea"]').value;
  draft.rbsCategory = form.querySelector('[data-field="rbsCategory"]').value;

  const errorBox = document.querySelector("[data-form-error]");
  if (!draft.title) {
    errorBox.textContent = "Risk Title is required.";
    errorBox.hidden = false;
    return;
  }
  if (requiredGroupsMissing()) {
    errorBox.textContent =
      "Pre-mitigation Likelihood, Direct Cost and Schedule are required.";
    errorBox.hidden = false;
    return;
  }
  if (formHasErrors()) {
    errorBox.textContent = "Fix the highlighted assessment fields before saving.";
    errorBox.hidden = false;
    return;
  }
  const saved = await saveRiskRecord(draft);
  if (!saved) {
    // Blocked by a conflict — the file changed on disk since this tab
    // loaded it. Stay on the form (draft isn't lost) and point at the
    // conflict banner rather than silently pretending it saved.
    errorBox.textContent =
      "This risk register changed elsewhere since you loaded it, so this save was blocked to avoid overwriting that change. Use the banner at the top of the page to reload the latest version, then re-enter this record.";
    errorBox.hidden = false;
    return;
  }
  errorBox.hidden = true;
  showList();
}

function populateRecordTypeOptions() {
  const select = document.querySelector('[data-field="recordType"]');
  if (!select) return;
  select.innerHTML = RECORD_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("");
}

function wire() {
  const { form } = els();
  populateRecordTypeOptions();
  document.querySelector("[data-new-record]")?.addEventListener("click", startNewRecord);
  document.querySelectorAll("[data-load-template]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await loadRiskRecordTemplate(Number(btn.dataset.loadTemplate));
    });
  });

  document.querySelector("[data-records-body]")?.addEventListener("click", async (event) => {
    const dupBtn = event.target.closest("[data-duplicate-record]");
    if (dupBtn) return duplicateRecord(dupBtn.dataset.duplicateRecord);
    const delBtn = event.target.closest("[data-delete-record]");
    if (delBtn) {
      if (confirm("Delete this risk record? This cannot be undone.")) {
        await deleteRiskRecord(delBtn.dataset.deleteRecord);
      }
      return;
    }
    const row = event.target.closest("tr[data-row-id]");
    if (row) startEditRecord(row.dataset.rowId);
  });

  document.querySelector("[data-view-mode-toggle]")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view-mode]");
    if (!btn) return;
    viewMode = btn.dataset.viewMode;
    sortState = { key: null, direction: "asc" }; // columns changed — old sort key may not exist anymore
    renderModeToggle();
    renderTableHead();
    renderTableBody();
  });

  document.querySelector("[data-records-thead]")?.addEventListener("click", (event) => {
    const th = event.target.closest("[data-sort-key]");
    if (!th) return;
    const key = th.dataset.sortKey;
    if (sortState.key === key) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState = { key, direction: "asc" };
    }
    renderTableHead();
    renderTableBody();
  });

  document.querySelectorAll("[data-cancel-form]").forEach((btn) =>
    btn.addEventListener("click", showList)
  );

  document.querySelector("[data-add-action]")?.addEventListener("click", () => {
    draft.actions.push(createLocalAction());
    renderActions();
  });

  form?.addEventListener("submit", submitForm);

  form?.querySelector('[data-field="riskType"]')?.addEventListener("change", (e) => {
    draft.riskType = e.target.value;
    renderActions();
  });
}

onRegisterChange((state) => {
  currentState = state;
  if (!draft) renderList();
});
wire();
