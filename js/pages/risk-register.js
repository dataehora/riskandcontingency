import {
  getRegisterState,
  onRegisterChange,
  saveRiskRecord,
  deleteRiskRecord,
  loadRiskRecordTemplate,
  blankRiskRecord,
  createLocalAction,
  holdAutoRefresh,
  suggestRiskId,
  RiskIdError,
  validateDistribution,
  calculateAssessment,
  totalCostRange,
  expectedValue,
  DIMENSIONS,
} from "../storage/register-store.js";
import {
  RECORD_TYPES,
  RISK_TYPES,
  RISK_STATUSES,
  REVIEW_STATUSES,
  POOLED_RECORD_TYPE,
  riskIdError,
  parseRequiredFields,
} from "../storage/workbook.js";
import { t, tn, tv, fmtNum, fmtInt, locale, onLangChange } from "../i18n/i18n.js";

// Value limits per dimension. Cost and schedule impacts must match the
// Risk Type: a threat adds cost/time (values >= 0), an opportunity saves
// it (values <= 0). No sign rule while the Risk Type is still blank.
const SIGNED_DIMENSIONS = ["costImpact", "knockOn", "scheduleImpact"];
function boundsFor(dim) {
  if (dim === "likelihood") return { min: 1, max: 100 };
  if (!SIGNED_DIMENSIONS.includes(dim)) return undefined;
  if (draft?.riskType === "Threat") return { min: 0, message: t("dist.error.threatSign") };
  if (draft?.riskType === "Opportunity") return { max: 0, message: t("dist.error.opportunitySign") };
  return undefined;
}

function signHint(dim) {
  if (!SIGNED_DIMENSIONS.includes(dim) || !draft?.riskType) return "";
  return t(draft.riskType === "Threat" ? "dim.sign.threat" : "dim.sign.opportunity");
}

// Which form fields are mandatory is chosen on the Configuration page
// (settings.requiredFieldsJson; default ID, Title, Status, Owner). Keys:
// detail field names, "<phase>.<dimension>" and "<phase>.qhse".
function requiredFields() {
  return parseRequiredFields(currentState.settings);
}
const DETAIL_FIELDS = ["id", "title", "riskType", "recordType", "status", "owner", "impactArea", "rbsCategory", "description", "cause", "effect"];

// Stored values (English, in the workbook); labels come from tv("strategy", s).
const STRATEGIES = {
  Threat: ["Eliminate", "Mitigate", "Transfer", "Monitor/Accept"],
  Opportunity: ["Exploit", "Enhance", "Share", "Monitor/Accept"],
};

let draft = null;
// The ID the open record had when the form opened (null = new record).
// Passed to saveRiskRecord so an edited ID renames that record rather
// than creating a second one.
let formOriginalId = null;
let currentState = getRegisterState();
let viewMode = "emv"; // emv | cost | schedule | qhse
let sortState = { key: null, direction: "asc" };

const ALL = "__all__";
const filters = { search: "", status: ALL, riskType: ALL, recordType: ALL, impactArea: ALL };

const VIEW_MODES = ["emv", "cost", "schedule", "qhse"];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function fmtNumber(n) {
  return fmtNum(n, 2);
}

function els() {
  return {
    listView: document.querySelector('[data-view="list"]'),
    formView: document.querySelector('[data-view="form"]'),
    recordsBody: document.querySelector("[data-records-body]"),
    recordsEmpty: document.querySelector("[data-records-empty]"),
    listWrap: document.querySelector("[data-records-list-wrap]"),
    form: document.querySelector("[data-record-form]"),
    assessmentSections: document.querySelector("[data-assessment-sections]"),
    actionsList: document.querySelector("[data-actions-list]"),
  };
}

function riskTypeBadge(riskType) {
  return `<span class="badge ${riskType === "Threat" ? "badge-high" : "badge-low"}">${escapeHtml(tv("riskType", riskType))}</span>`;
}

function statusBadgeClass(status) {
  if (status === "Open") return "badge-open";
  if (REVIEW_STATUSES.includes(status)) return "badge-medium";
  return "badge-neutral";
}

function statusBadge(status) {
  return `<span class="badge ${statusBadgeClass(status)}" style="white-space:nowrap;">${escapeHtml(tv("status", status))}</span>`;
}

// --- List view ----------------------------------------------------------
function baseColumns() {
  return [
    { key: "id", label: t("rr.col.id"), sort: (r) => r.id, render: (r) => `<span style="white-space:nowrap;">${escapeHtml(r.id)}</span>` },
    { key: "title", label: t("rr.col.title"), sort: (r) => r.title.toLowerCase(), render: (r) => escapeHtml(r.title) },
    { key: "riskType", label: t("rr.col.type"), sort: (r) => tv("riskType", r.riskType), render: (r) => riskTypeBadge(r.riskType) },
    { key: "status", label: t("rr.col.status"), sort: (r) => RISK_STATUSES.indexOf(r.status), render: (r) => statusBadge(r.status) },
    { key: "recordType", label: t("rr.col.recordType"), sort: (r) => tv("recordType", r.recordType), render: (r) => escapeHtml(tv("recordType", r.recordType)) },
    { key: "impactArea", label: t("rr.col.impactArea"), sort: (r) => r.impactArea, render: (r) => escapeHtml(r.impactArea) },
    { key: "owner", label: t("rr.col.owner"), sort: (r) => r.owner, render: (r) => escapeHtml(r.owner) },
  ];
}

function likelihoodColumns() {
  return [
    {
      key: "preLikelihood",
      label: t("rr.col.preLikelihood"),
      highlight: true,
      sort: (r) => expectedValue(r.pre.likelihood),
      render: (r) => `${fmtNumber(expectedValue(r.pre.likelihood))}%`,
    },
    {
      key: "postLikelihood",
      label: t("rr.col.postLikelihood"),
      highlight: true,
      sort: (r) => expectedValue(r.post.likelihood),
      render: (r) => `${fmtNumber(expectedValue(r.post.likelihood))}%`,
    },
  ];
}

function modeColumns(mode) {
  const L = (key) => t(`rr.col.${key}`);
  if (mode === "cost") {
    return [
      ...likelihoodColumns(),
      { key: "preCostMin", label: L("preMin"), highlight: true, sort: (r) => totalCostRange(r.pre).min, render: (r) => fmtNumber(totalCostRange(r.pre).min) },
      { key: "preCostMl", label: L("preMl"), highlight: true, sort: (r) => totalCostRange(r.pre).ev, render: (r) => fmtNumber(totalCostRange(r.pre).ev) },
      { key: "preCostMax", label: L("preMax"), highlight: true, sort: (r) => totalCostRange(r.pre).max, render: (r) => fmtNumber(totalCostRange(r.pre).max) },
      { key: "postCostMin", label: L("postMin"), highlight: true, sort: (r) => totalCostRange(r.post).min, render: (r) => fmtNumber(totalCostRange(r.post).min) },
      { key: "postCostMl", label: L("postMl"), highlight: true, sort: (r) => totalCostRange(r.post).ev, render: (r) => fmtNumber(totalCostRange(r.post).ev) },
      { key: "postCostMax", label: L("postMax"), highlight: true, sort: (r) => totalCostRange(r.post).max, render: (r) => fmtNumber(totalCostRange(r.post).max) },
    ];
  }
  if (mode === "schedule") {
    const dashOr = (v) => (v == null ? "—" : fmtNumber(v));
    return [
      ...likelihoodColumns(),
      { key: "preSchedMin", label: L("preMin"), highlight: true, sort: (r) => r.pre.scheduleImpact.min ?? -Infinity, render: (r) => dashOr(r.pre.scheduleImpact.min) },
      { key: "preSchedMl", label: L("preMl"), highlight: true, sort: (r) => r.pre.scheduleImpact.ml ?? -Infinity, render: (r) => dashOr(r.pre.scheduleImpact.ml) },
      { key: "preSchedMax", label: L("preMax"), highlight: true, sort: (r) => r.pre.scheduleImpact.max ?? -Infinity, render: (r) => dashOr(r.pre.scheduleImpact.max) },
      { key: "postSchedMin", label: L("postMin"), highlight: true, sort: (r) => r.post.scheduleImpact.min ?? -Infinity, render: (r) => dashOr(r.post.scheduleImpact.min) },
      { key: "postSchedMl", label: L("postMl"), highlight: true, sort: (r) => r.post.scheduleImpact.ml ?? -Infinity, render: (r) => dashOr(r.post.scheduleImpact.ml) },
      { key: "postSchedMax", label: L("postMax"), highlight: true, sort: (r) => r.post.scheduleImpact.max ?? -Infinity, render: (r) => dashOr(r.post.scheduleImpact.max) },
    ];
  }
  if (mode === "qhse") {
    return [
      ...likelihoodColumns(),
      { key: "preQhse", label: L("preQhse"), highlight: true, sort: (r) => r.pre.qhse ?? "", render: (r) => escapeHtml(r.pre.qhse ?? "—") },
      { key: "postQhse", label: L("postQhse"), highlight: true, sort: (r) => r.post.qhse ?? "", render: (r) => escapeHtml(r.post.qhse ?? "—") },
    ];
  }
  // emv (default)
  return [
    { key: "preEmv", label: L("preEmv"), highlight: true, sort: (r) => r.computed.pre.emv, render: (r) => fmtNumber(r.computed.pre.emv) },
    { key: "postEmv", label: L("postEmv"), highlight: true, sort: (r) => r.computed.post.emv, render: (r) => fmtNumber(r.computed.post.emv) },
  ];
}

function currentColumns() {
  return [...baseColumns(), ...modeColumns(viewMode)];
}

// --- Filters --------------------------------------------------------------
function filtersActive() {
  return !!filters.search || ["status", "riskType", "recordType", "impactArea"].some((k) => filters[k] !== ALL);
}

function filteredRecords() {
  const q = filters.search.trim().toLowerCase();
  return currentState.riskRecords.filter((r) => {
    if (filters.status !== ALL && r.status !== filters.status) return false;
    if (filters.riskType !== ALL && r.riskType !== filters.riskType) return false;
    if (filters.recordType !== ALL && r.recordType !== filters.recordType) return false;
    if (filters.impactArea !== ALL && r.impactArea !== filters.impactArea) return false;
    if (q) {
      const haystack = [r.id, r.title, r.owner, r.rbsCategory, r.impactArea, r.description].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// options: [{ value, label }]. Keeps the current filter if still offered.
function fillFilterSelect(key, options, allLabel) {
  const select = document.querySelector(`[data-list-filter="${key}"]`);
  if (!select) return;
  if (filters[key] !== ALL && !options.some((o) => o.value === filters[key])) filters[key] = ALL;
  select.innerHTML =
    `<option value="${ALL}">${escapeHtml(allLabel)}</option>` +
    options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  select.value = filters[key];
}

function renderFilters() {
  fillFilterSelect("status", RISK_STATUSES.map((s) => ({ value: s, label: tv("status", s) })), t("rr.filter.allStatuses"));
  fillFilterSelect("riskType", RISK_TYPES.map((s) => ({ value: s, label: tv("riskType", s) })), t("rr.filter.allTypes"));
  fillFilterSelect("recordType", RECORD_TYPES.map((s) => ({ value: s, label: tv("recordType", s) })), t("rr.filter.allRecordTypes"));
  const impactAreas = [
    ...new Set([...currentState.impactAreas.map((i) => i.name), ...currentState.riskRecords.map((r) => r.impactArea).filter(Boolean)]),
  ];
  fillFilterSelect("impactArea", impactAreas.map((v) => ({ value: v, label: v })), t("rr.filter.allImpactAreas"));
  const search = document.querySelector('[data-list-filter="search"]');
  if (search && document.activeElement !== search) search.value = filters.search;
  const clear = document.querySelector("[data-clear-filters]");
  if (clear) clear.hidden = !filtersActive();
}

// "Showing 3 of 12 risk records · 2 threats, 1 opportunity · 2 open"
function summaryText(records) {
  const total = currentState.riskRecords.length;
  const threats = records.filter((r) => r.riskType === "Threat").length;
  const open = records.filter((r) => r.status === "Open").length;
  const count = filtersActive()
    ? t("rr.summary.filtered", { shown: fmtInt(records.length), total: tn("rr.summary.records", total) })
    : tn("rr.summary.records", total);
  const parts = [count];
  if (records.length) {
    parts.push(`${tn("rr.summary.threats", threats)}, ${tn("rr.summary.opportunities", records.length - threats)}`);
    parts.push(tn("rr.summary.open", open));
  }
  return parts.join(" · ");
}

function renderSummaries(records) {
  const text = summaryText(records);
  document.querySelectorAll("[data-records-summary]").forEach((el) => {
    el.textContent = text;
  });
}

function sortedRecords() {
  const records = filteredRecords();
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
      `<button type="button" class="btn btn-sm ${viewMode === m ? "btn-primary" : "btn-secondary"}" data-view-mode="${m}">${t(`rr.view.${m}`)}</button>`
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
  const { recordsBody, recordsEmpty, listWrap } = els();
  if (!recordsBody) return;
  const total = currentState.riskRecords.length;
  if (recordsEmpty) recordsEmpty.hidden = total > 0;
  if (listWrap) listWrap.hidden = total === 0;

  const records = sortedRecords();
  const columns = currentColumns();
  recordsBody.innerHTML = records.length
    ? records
        .map(
          (r) => `
    <tr data-row-id="${escapeHtml(r.id)}">
      ${columns.map((col) => `<td class="${col.highlight ? "col-highlight" : ""}">${col.render(r)}</td>`).join("")}
      <td style="white-space:nowrap;">
        <button type="button" class="btn btn-ghost btn-sm" data-duplicate-record="${escapeHtml(r.id)}">${t("rr.duplicate")}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-delete-record="${escapeHtml(r.id)}">${t("common.delete")}</button>
      </td>
    </tr>
  `
        )
        .join("")
    : `<tr><td colspan="${columns.length + 1}" class="table-empty">${t("rr.filter.noMatch")}</td></tr>`;
  renderTableFoot(columns, records);
  renderSummaries(records);
  const clear = document.querySelector("[data-clear-filters]");
  if (clear) clear.hidden = !filtersActive();
}

// EMV view only: net totals (threats positive, opportunities negative)
// across every record currently listed (i.e. after filters).
function renderTableFoot(columns, records) {
  const tfoot = document.querySelector("[data-records-tfoot]");
  if (!tfoot) return;
  if (viewMode !== "emv" || !records.length) {
    tfoot.innerHTML = "";
    return;
  }
  const sum = (phase) => records.reduce((acc, r) => acc + (r.computed?.[phase]?.emv || 0), 0);
  const totals = { preEmv: sum("pre"), postEmv: sum("post") };
  const firstTotal = columns.findIndex((c) => c.key in totals);
  tfoot.innerHTML = `
    <tr>
      <td colspan="${firstTotal}">${escapeHtml(tn("rr.totalEmv", records.length))}</td>
      ${columns
        .slice(firstTotal)
        .map((c) => `<td class="${c.highlight ? "col-highlight" : ""}">${c.key in totals ? fmtNumber(totals[c.key]) : ""}</td>`)
        .join("")}
      <td></td>
    </tr>
  `;
}

function renderIdRepairs() {
  const el = document.querySelector("[data-id-repairs]");
  if (!el) return;
  const repairs = currentState.idRepairs ?? [];
  el.hidden = repairs.length === 0;
  if (!repairs.length) return;
  el.innerHTML = `
    <span aria-hidden="true">&#9888;&#65039;</span>
    <div>
      <p style="margin:0 0 4px;"><strong>${t("rr.repairs.title")}</strong> ${t("rr.repairs.body")}</p>
      <ul style="margin:0; padding-left: 1.2em;">
        ${repairs
          .map(
            (r) =>
              `<li>${t(`rr.repairs.${r.reason}`, {
                title: `“${escapeHtml(r.title)}”`,
                from: escapeHtml(r.from),
                to: `<strong>${escapeHtml(r.to)}</strong>`,
              })}</li>`
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderList() {
  renderIdRepairs();
  renderFilters();
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
    `<option value="">${escapeHtml(placeholder)}</option>` +
    options.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  select.value = value ?? "";
}

// Fixed enum select: stored value, translated label.
function populateEnum(select, values, group, value, placeholder = null) {
  select.innerHTML =
    (placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "") +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(tv(group, v))}</option>`).join("");
  if (value != null) select.value = value;
}

// --- Assessment (distribution) groups -------------------------------------
function distGroupHtml(phase, dim) {
  const required = requiredFields().has(`${phase}.${dim}`);
  const showsMax = dim === "costImpact" || dim === "knockOn" || dim === "scheduleImpact";
  return `
    <div class="dist-group${required ? " is-required" : ""}" data-phase="${phase}" data-dim="${dim}">
      <div class="dist-group-header">
        <h4>${t(`dim.${dim}`)}</h4>
        <span class="dist-group-unit">${t(`dim.${dim}.unit`)}<span class="sign-hint" data-sign-hint="${dim}">${signHint(dim)}</span></span>
      </div>
      <div class="dist-inputs">
        <label>${t("dist.min")}<input type="number" step="any" data-cell="min"></label>
        <label>${t("dist.ml")}<input type="number" step="any" data-cell="ml"></label>
        <label>${t("dist.max")}<input type="number" step="any" data-cell="max"></label>
      </div>
      <div class="dist-feedback" data-feedback></div>
      ${showsMax ? `<div class="dist-computed" data-computed></div>` : ""}
    </div>
  `;
}

function qhseGroupHtml(phase) {
  return `
    <div class="qhse-group${requiredFields().has(`${phase}.qhse`) ? " is-required" : ""}" data-phase="${phase}">
      <div class="dist-group-header">
        <h4>${t("dim.qhse")}</h4>
        <span class="dist-group-unit">${t("dim.qhse.unit")}</span>
      </div>
      <select data-qhse-select></select>
    </div>
  `;
}

function assessmentSectionHtml(phase) {
  return `
    <div class="card" style="margin-bottom: var(--space-5);" data-assessment-phase="${phase}">
      <h3>${t(`rr.assessment.${phase}.title`)}</h3>
      <p>${t(`rr.assessment.${phase}.hint`)}</p>

      ${distGroupHtml(phase, "likelihood")}

      <div class="total-cost-block">
        <div class="dist-group-header">
          <h4>${t("dim.totalCost")}</h4>
          <span class="dist-group-unit">${t("dim.totalCost.unit")}</span>
        </div>
        <div class="assessment-summary computed-tiles" title="${escapeHtml(t("rr.totalCost.note"))}">
          <div class="stat-tile">
            <div class="stat-label">${t("dist.min")}</div>
            <div class="stat-value" data-total-cost="min">—</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">${t("dist.expected")}</div>
            <div class="stat-value" data-total-cost="ev">—</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">${t("dist.max")}</div>
            <div class="stat-value" data-total-cost="max">—</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">${t("rr.view.emv")}</div>
            <div class="stat-value" data-summary="emv">—</div>
          </div>
        </div>
        <p class="computed-note"><span aria-hidden="true">&#128274;</span>${t("rr.totalCost.note")}</p>

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
  const result = validateDistribution({ min, ml, max }, boundsFor(dim));
  const required = requiredFields().has(`${phase}.${dim}`);

  draft[phase][dim] = { min, ml, max, type: result.valid ? result.type : null };

  const feedback = groupEl.querySelector("[data-feedback]");
  if (result.empty) {
    feedback.textContent = required ? t("rr.required") : "";
    feedback.removeAttribute("data-valid");
  } else if (result.valid) {
    feedback.textContent = t(`dist.type.${result.type}`);
    feedback.dataset.valid = "true";
  } else {
    feedback.textContent = result.message;
    feedback.dataset.valid = "false";
  }

  const computedEl = groupEl.querySelector("[data-computed]");
  if (computedEl) {
    const computed = calculateAssessment(draft[phase]);
    if (dim === "costImpact") computedEl.textContent = t("rr.computed.maxDirectCost", { value: fmtNumber(computed.maxDirectCost) });
    if (dim === "knockOn") computedEl.textContent = t("rr.computed.maxKnockOn", { value: fmtNumber(computed.maxKnockOn) });
    if (dim === "scheduleImpact")
      computedEl.textContent = t("rr.computed.schedule", {
        max: fmtNumber(computed.maxSchedule),
        exposure: fmtNumber(computed.scheduleExposure),
      });
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
  populateOptions(select, currentState.qhseLevels, t("rr.select.qhse"), draft[phase].qhse);
  select.addEventListener("change", () => {
    draft[phase].qhse = select.value || null;
  });
}

// --- Response actions ------------------------------------------------
function actionRowHtml(action) {
  const strategies = STRATEGIES[draft.riskType] ?? STRATEGIES.Threat;
  return `
    <div class="action-row" data-action-id="${escapeHtml(action.id)}">
      <div><label>${t("rr.action.id")}</label><div class="action-id" title="${escapeHtml(t("rr.action.idHint"))}">${action.id.startsWith("local-") ? t("rr.action.newId") : escapeHtml(action.id)}</div></div>
      <div><label>${t("rr.action.title")}</label><input type="text" data-action-field="title" value="${escapeHtml(action.title)}"></div>
      <div><label>${t("rr.action.owner")}</label>
        <select data-action-field="owner" data-options="owners"></select>
      </div>
      <div><label>${t("rr.action.strategy")}</label>
        <select data-action-field="strategy">
          <option value="">${t("rr.select.generic")}</option>
          ${strategies.map((s) => `<option value="${s}" ${action.strategy === s ? "selected" : ""}>${escapeHtml(tv("strategy", s))}</option>`).join("")}
        </select>
      </div>
      <div><label>${t("rr.action.dueDate")}</label><input type="date" data-action-field="dueDate" value="${escapeHtml(action.dueDate)}"></div>
      <div><label>${t("rr.action.cost")}</label><input type="number" step="any" data-action-field="cost" value="${action.cost ?? 0}"></div>
      <div><button type="button" class="btn btn-ghost btn-sm" data-remove-action="${escapeHtml(action.id)}">${t("common.remove")}</button></div>
    </div>
  `;
}

function renderActions() {
  const { actionsList } = els();
  if (!actionsList) return;
  actionsList.innerHTML = draft.actions.length
    ? draft.actions.map(actionRowHtml).join("")
    : `<p style="color: var(--color-text-subtle); font-size: 0.85rem;">${t("rr.response.none")}</p>`;

  actionsList.querySelectorAll("[data-action-field]").forEach((input) => {
    const row = input.closest("[data-action-id]");
    const id = row.dataset.actionId;
    if (input.dataset.actionField === "owner") {
      const action = draft.actions.find((a) => a.id === id);
      populateOptions(input, currentState.owners, t("rr.select.owner"), action?.owner);
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

// Explains, next to Status / Record Type, when this record won't be in
// the Monte Carlo model (only Open + Regular Pooled Record are).
function updateStatusHint() {
  const el = document.querySelector("[data-status-hint]");
  const form = els().form;
  if (!el || !form) return;
  const status = form.querySelector('[data-field="status"]').value;
  const recordType = form.querySelector('[data-field="recordType"]').value;
  const modelled = status === "Open" && recordType === POOLED_RECORD_TYPE;
  el.textContent = modelled ? t("rr.statusHint.modelled") : t("rr.statusHint.notModelled");
  el.dataset.valid = modelled ? "true" : "";
}

function renderForm() {
  const { form, formView, listView } = els();
  holdAutoRefresh(true);
  listView.hidden = true;
  formView.hidden = false;

  formOriginalId = draft.id ?? null;
  form.querySelector('[data-field="id"]').value = draft.id ?? suggestRiskId();
  updateIdFeedback();
  form.querySelector('[data-field="title"]').value = draft.title;
  populateEnum(form.querySelector('[data-field="riskType"]'), RISK_TYPES, "riskType", draft.riskType ?? "", t("rr.select.riskType"));
  populateEnum(form.querySelector('[data-field="recordType"]'), RECORD_TYPES, "recordType", draft.recordType ?? "", t("rr.select.recordType"));
  populateEnum(form.querySelector('[data-field="status"]'), RISK_STATUSES, "status", draft.status ?? "", t("rr.select.status"));
  form.querySelector('[data-field="description"]').value = draft.description;
  form.querySelector('[data-field="cause"]').value = draft.cause;
  form.querySelector('[data-field="effect"]').value = draft.effect;
  updateStatusHint();
  markRequiredLabels();

  populateOptions(form.querySelector('[data-field="owner"]'), currentState.owners, t("rr.select.owner"), draft.owner);
  populateOptions(form.querySelector('[data-field="impactArea"]'), currentState.impactAreas, t("rr.select.impactArea"), draft.impactArea);
  populateOptions(form.querySelector('[data-field="rbsCategory"]'), currentState.rbs, t("rr.select.rbs"), draft.rbsCategory);

  buildAssessmentSections();
  for (const phase of ["pre", "post"]) {
    for (const dim of DIMENSIONS) {
      const groupEl = document.querySelector(`.dist-group[data-phase="${phase}"][data-dim="${dim}"]`);
      fillDistGroup(groupEl, draft[phase][dim]);
    }
    fillQhseGroup(phase);
  }

  renderActions();
  updateMissingRequired();
}

function showList() {
  const { formView, listView } = els();
  document.querySelector("[data-form-error]")?.setAttribute("hidden", "");
  formView.hidden = true;
  listView.hidden = false;
  draft = null;
  holdAutoRefresh(false);
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
  draft.title = t("rr.copyTitle", { title: draft.title });
  draft.lastActionNumber = 0;
  draft.createdAt = "";
  draft.updatedAt = "";
  draft.actions = draft.actions.map((a) => ({ ...a, id: createLocalAction().id }));
  renderForm();
}

function idFieldValue() {
  return document.querySelector('[data-field="id"]')?.value.trim() ?? "";
}

// Live check of the ID field: unique (case-insensitive) across every
// other record and safe characters only. The store re-checks on save
// against the on-disk state, so this is guidance, not the only guard.
function updateIdFeedback() {
  const el = document.querySelector("[data-id-feedback]");
  if (!el) return null;
  const id = idFieldValue();
  const error = riskIdError(id, currentState.riskRecords, formOriginalId);
  el.dataset.valid = error ? "false" : "true";
  if (error) el.textContent = error;
  else if (formOriginalId && id !== formOriginalId) el.textContent = t("rr.id.renames", { from: formOriginalId, to: id });
  else el.textContent = formOriginalId ? t("rr.id.unique") : t("rr.id.suggested");
  return error;
}

function formHasErrors() {
  return !!document.querySelector('.dist-feedback[data-valid="false"]');
}

// Marks required Details labels with an asterisk (CSS) for the current
// configuration.
function markRequiredLabels() {
  const required = requiredFields();
  for (const field of DETAIL_FIELDS) {
    document.querySelector(`label[for="f-${field}"]`)?.classList.toggle("is-required", required.has(field));
  }
}

// Every required field that's still empty: [{ key, label, elements }].
// Also paints them (red background, .is-missing) — runs live on every
// input, so the highlight clears as soon as a field is filled.
function updateMissingRequired() {
  const form = els().form;
  if (!form || !draft) return [];
  const required = requiredFields();
  const missing = [];
  form.querySelectorAll(".is-missing").forEach((el) => el.classList.remove("is-missing"));
  for (const key of required) {
    let elements = [];
    let label = "";
    if (DETAIL_FIELDS.includes(key)) {
      const el = form.querySelector(`[data-field="${key}"]`);
      if (el && !el.value.trim()) elements = [el];
      label = t(`rr.field.${key}`);
    } else {
      const [phase, dim] = key.split(".");
      label = `${t(dim === "qhse" ? "rr.view.qhse" : `dim.${dim}`)} (${t(`phase.${phase}`)})`;
      if (dim === "qhse") {
        const el = document.querySelector(`.qhse-group[data-phase="${phase}"] [data-qhse-select]`);
        if (el && !el.value) elements = [el];
      } else {
        const group = document.querySelector(`.dist-group[data-phase="${phase}"][data-dim="${dim}"]`);
        const inputs = group ? [...group.querySelectorAll("input")] : [];
        if (inputs.length && inputs.every((i) => !i.value.trim())) elements = inputs;
      }
    }
    if (elements.length) {
      elements.forEach((el) => el.classList.add("is-missing"));
      missing.push({ key, label });
    }
  }
  return missing;
}

// Copies the Details fields (everything but the ID) into the draft.
// Assessment cells and actions are synced into the draft as they're typed.
function readDetailsIntoDraft() {
  const { form } = els();
  const val = (field) => form.querySelector(`[data-field="${field}"]`).value;
  draft.title = val("title").trim();
  draft.riskType = val("riskType");
  draft.recordType = val("recordType");
  draft.status = val("status");
  draft.description = val("description");
  draft.cause = val("cause");
  draft.effect = val("effect");
  draft.owner = val("owner");
  draft.impactArea = val("impactArea");
  draft.rbsCategory = val("rbsCategory");
}

async function submitForm(event) {
  event.preventDefault();
  draft.id = idFieldValue();
  readDetailsIntoDraft();

  const errorBox = document.querySelector("[data-form-error]");
  const idError = updateIdFeedback();
  if (idError) {
    errorBox.textContent = idError;
    errorBox.hidden = false;
    return;
  }
  const missing = updateMissingRequired();
  if (missing.length) {
    errorBox.textContent = t("rr.error.missing", { fields: missing.map((m) => m.label).join(", ") });
    errorBox.hidden = false;
    document.querySelector(".is-missing")?.focus();
    return;
  }
  if (formHasErrors()) {
    errorBox.textContent = t("rr.error.fields");
    errorBox.hidden = false;
    return;
  }
  let saved;
  try {
    saved = await saveRiskRecord(draft, { originalId: formOriginalId });
  } catch (err) {
    if (!(err instanceof RiskIdError)) throw err;
    errorBox.textContent = err.message;
    errorBox.hidden = false;
    updateIdFeedback();
    return;
  }
  if (!saved) {
    // Blocked by a conflict — the file changed on disk since this tab
    // loaded it. Stay on the form (draft isn't lost) and point at the
    // conflict banner rather than silently pretending it saved.
    errorBox.textContent = t("rr.error.conflict");
    errorBox.hidden = false;
    return;
  }
  errorBox.hidden = true;
  // Stay on the record after saving (so the user can keep editing it),
  // picking up the saved copy — a new record now has its real id and
  // response actions their final ids, so a second save updates rather
  // than duplicates.
  draft = JSON.parse(JSON.stringify(saved));
  renderForm();
  showSaveToast(t("rr.saved", { id: saved.id, title: saved.title, time: new Date().toLocaleTimeString(locale()) }));
}

let toastTimer = null;
function showSaveToast(message) {
  const toast = document.querySelector("[data-save-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

// Language switched: rebuild the open form's generated parts without
// losing anything typed (ID field included — it may be mid-rename).
function relabelForm() {
  const idValue = idFieldValue();
  const originalId = formOriginalId;
  readDetailsIntoDraft();
  renderForm();
  formOriginalId = originalId;
  document.querySelector('[data-field="id"]').value = idValue;
  updateIdFeedback();
  const errorBox = document.querySelector("[data-form-error]");
  if (errorBox) errorBox.hidden = true;
}

function wire() {
  const { form } = els();
  document.querySelector("[data-new-record]")?.addEventListener("click", startNewRecord);
  document.querySelectorAll("[data-load-template]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const saved = await loadRiskRecordTemplate(Number(btn.dataset.loadTemplate));
      if (saved) showSaveToast(t("rr.templateAdded", { id: saved.id, title: saved.title }));
      else if (!currentState.conflict && !currentState.saveError) showSaveToast(t("rr.notReady"));
    });
  });

  document.querySelector("[data-records-body]")?.addEventListener("click", async (event) => {
    const dupBtn = event.target.closest("[data-duplicate-record]");
    if (dupBtn) return duplicateRecord(dupBtn.dataset.duplicateRecord);
    const delBtn = event.target.closest("[data-delete-record]");
    if (delBtn) {
      if (confirm(t("rr.confirmDelete"))) {
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

  document.querySelectorAll("[data-list-filter]").forEach((input) => {
    const event = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(event, () => {
      filters[input.dataset.listFilter] = input.value;
      renderTableBody();
    });
  });
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    Object.assign(filters, { search: "", status: ALL, riskType: ALL, recordType: ALL, impactArea: ALL });
    renderFilters();
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
  form?.addEventListener("input", updateMissingRequired);
  form?.addEventListener("change", updateMissingRequired);
  form?.querySelector('[data-field="id"]')?.addEventListener("input", updateIdFeedback);

  form?.querySelector('[data-field="riskType"]')?.addEventListener("change", (e) => {
    draft.riskType = e.target.value;
    renderActions();
    // Re-check every cost/schedule group against the new sign rule.
    document.querySelectorAll(".dist-group").forEach((groupEl) => updateDistGroup(groupEl));
    document.querySelectorAll("[data-sign-hint]").forEach((el) => {
      el.textContent = signHint(el.dataset.signHint);
    });
  });
  form?.querySelector('[data-field="status"]')?.addEventListener("change", updateStatusHint);
  form?.querySelector('[data-field="recordType"]')?.addEventListener("change", updateStatusHint);
}

onRegisterChange((state) => {
  currentState = state;
  if (!draft) renderList();
});
onLangChange(() => {
  if (draft) relabelForm();
  else renderList();
});
wire();
