import { getRegisterState, onRegisterChange } from "../storage/register-store.js";
import { RECORD_TYPES, POOLED_RECORD_TYPE, REVIEW_STATUSES, isClosedStatus, RISK_STATUSES } from "../storage/workbook.js";
import {
  parseRamConfig,
  resolveBins,
  riskPoints,
  cellSeverity,
  likelihoodLabel,
  costLabel,
} from "../storage/ram.js";
import { renderRiskMatrix } from "../charts/risk-matrix.js";
import { t, tn, tv, fmtInt, fmtNum, onLangChange } from "../i18n/i18n.js";

const ALL = "__all__";
const filters = { phase: "pre", impactArea: ALL, recordType: ALL };
let currentState = getRegisterState();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- Register summary (automated narrative) ---------------------------
// Everything here is derived from the whole register (not the matrix
// filters below). "Under review" = Draft + Proposed. Mitigation figures
// cover Open risks only — that's the live exposure — and a risk with no
// post-mitigation assessment yet keeps its pre-mitigation EMV as its
// post-mitigation value (otherwise an unassessed risk would look fully
// mitigated, since an empty assessment computes to EMV 0).
function hasPostAssessment(record) {
  return !!record.post?.likelihood?.type;
}

function postEmv(record) {
  return hasPostAssessment(record) ? record.computed.post.emv : record.computed.pre.emv;
}

function registerFacts(records) {
  const byStatus = Object.fromEntries(RISK_STATUSES.map((s) => [s, 0]));
  for (const r of records) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const open = records.filter((r) => r.status === "Open");
  const openThreats = open.filter((r) => r.riskType === "Threat");
  const openOpps = open.filter((r) => r.riskType === "Opportunity");
  const sum = (list, fn) => list.reduce((acc, r) => acc + (fn(r) || 0), 0);
  const openActions = open.flatMap((r) => r.actions ?? []);
  const strategies = {};
  for (const a of openActions) if (a.strategy) strategies[a.strategy] = (strategies[a.strategy] ?? 0) + 1;
  const topResidual = [...openThreats].sort((a, b) => postEmv(b) - postEmv(a))[0] ?? null;

  return {
    total: records.length,
    threats: records.filter((r) => r.riskType === "Threat").length,
    opportunities: records.filter((r) => r.riskType === "Opportunity").length,
    byStatus,
    open: open.length,
    review: records.filter((r) => REVIEW_STATUSES.includes(r.status)).length,
    closed: records.filter((r) => isClosedStatus(r.status)).length,
    byRecordType: Object.fromEntries(RECORD_TYPES.map((rt) => [rt, records.filter((r) => r.recordType === rt).length])),
    openThreats: openThreats.length,
    openOpps: openOpps.length,
    threatPre: sum(openThreats, (r) => r.computed.pre.emv),
    threatPost: sum(openThreats, postEmv),
    oppPre: sum(openOpps, (r) => r.computed.pre.emv),
    oppPost: sum(openOpps, postEmv),
    netPre: sum(open, (r) => r.computed.pre.emv),
    netPost: sum(open, postEmv),
    openWithoutPost: open.filter((r) => !hasPostAssessment(r)).length,
    actionCount: openActions.length,
    actionCost: sum(openActions, (a) => Number(a.cost)),
    strategies,
    threatsWithoutAction: openThreats.filter((r) => !(r.actions ?? []).length).length,
    topResidual,
    modelledCount: open.filter((r) => r.recordType === POOLED_RECORD_TYPE).length,
  };
}

function pct(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

function narrative(f) {
  const n = (key, count, vars) => tn(key, count, vars);
  const money = fmtInt;
  const paragraphs = [];

  // 1. What's in the register.
  paragraphs.push(
    t("rep.text.overview", {
      total: n("rep.n.records", f.total),
      threats: n("rr.summary.threats", f.threats),
      opportunities: n("rr.summary.opportunities", f.opportunities),
    }) +
      " " +
      t("rep.text.recordTypes", {
        pooled: fmtInt(f.byRecordType["Regular Pooled Record"]),
        highImpact: fmtInt(f.byRecordType["High Impact"]),
        benchmark: fmtInt(f.byRecordType.Benchmark),
      })
  );

  // 2. Status: open / under review / closed.
  const closedKinds = RISK_STATUSES.filter((s) => isClosedStatus(s) && f.byStatus[s])
    .map((s) => n(`rep.closedKind.${s.replace("Closed - ", "")}`, f.byStatus[s]))
    .join(", ");
  paragraphs.push(
    t("rep.text.status", {
      open: n("rep.n.open", f.open),
      review: n("rep.n.review", f.review),
      reviewDetail: f.review ? t("rep.text.reviewDetail", { draft: fmtInt(f.byStatus.Draft), proposed: fmtInt(f.byStatus.Proposed) }) : "",
      closed: n("rep.n.closed", f.closed),
    }) +
      (closedKinds ? ` (${closedKinds})` : "") +
      ". " +
      t("rep.text.modelled", { count: n("rep.n.modelled", f.modelledCount) })
  );

  // 3. Mitigation of the open risks.
  if (!f.open) {
    paragraphs.push(t("rep.text.noOpen"));
  } else {
    const parts = [];
    if (f.openThreats) {
      const reduction = f.threatPre - f.threatPost;
      parts.push(
        reduction >= 0
          ? t("rep.text.threatsReduced", {
              count: n("rep.n.openThreats", f.openThreats),
              pre: money(f.threatPre),
              post: money(f.threatPost),
              reduction: money(reduction),
              pct: pct(reduction, f.threatPre),
            })
          : t("rep.text.threatsIncreased", {
              count: n("rep.n.openThreats", f.openThreats),
              pre: money(f.threatPre),
              post: money(f.threatPost),
            })
      );
    }
    if (f.openOpps) {
      parts.push(n("rep.text.opportunities", f.openOpps, { pre: money(Math.abs(f.oppPre)), post: money(Math.abs(f.oppPost)) }));
    }
    parts.push(t("rep.text.net", { pre: money(f.netPre), post: money(f.netPost) }));
    if (f.openWithoutPost) parts.push(n("rep.text.withoutPost", f.openWithoutPost));
    paragraphs.push(parts.join(" "));

    // 4. Response actions.
    const actionParts = [];
    if (f.actionCount) {
      const strategyList = Object.entries(f.strategies)
        .sort((a, b) => b[1] - a[1])
        .map(([s, c]) => `${fmtInt(c)} ${tv("strategy", s)}`)
        .join(", ");
      actionParts.push(
        n("rep.text.actions", f.actionCount, { cost: money(f.actionCost) }) +
          (strategyList ? " " + t("rep.text.strategies", { list: strategyList }) : "")
      );
      const reduction = f.threatPre - f.threatPost;
      if (f.actionCost > 0 && reduction > 0) {
        actionParts.push(t("rep.text.ratio", { ratio: fmtNum(reduction / f.actionCost, 1) }));
      }
    } else {
      actionParts.push(t("rep.text.noActions"));
    }
    if (f.threatsWithoutAction) actionParts.push(n("rep.text.threatsWithoutAction", f.threatsWithoutAction));
    paragraphs.push(actionParts.join(" "));

    if (f.topResidual) {
      paragraphs.push(
        t("rep.text.top", {
          id: f.topResidual.id,
          title: f.topResidual.title,
          emv: money(postEmv(f.topResidual)),
        })
      );
    }
  }
  return paragraphs;
}

function renderSummary() {
  const kpisEl = document.querySelector("[data-report-kpis]");
  const textEl = document.querySelector("[data-report-narrative]");
  if (!kpisEl || !textEl) return;
  const f = registerFacts(currentState.riskRecords);
  const tile = (label, value, sub = "") =>
    `<div class="stat-tile"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>`;
  kpisEl.innerHTML = [
    tile(t("rep.kpi.records"), fmtInt(f.total), `${tn("rr.summary.threats", f.threats)} · ${tn("rr.summary.opportunities", f.opportunities)}`),
    tile(t("rep.kpi.open"), fmtInt(f.open)),
    tile(t("rep.kpi.review"), fmtInt(f.review), t("rep.kpi.reviewSub")),
    tile(t("rep.kpi.closed"), fmtInt(f.closed)),
    tile(t("rep.kpi.preEmv"), fmtInt(f.netPre), t("rep.kpi.openOnly")),
    tile(t("rep.kpi.postEmv"), fmtInt(f.netPost), f.netPre ? t("rep.kpi.change", { pct: pct(f.netPost - f.netPre, Math.abs(f.netPre)) }) : t("rep.kpi.openOnly")),
  ].join("");
  textEl.innerHTML = narrative(f)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

// --- Risk Assessment Matrix --------------------------------------------
function fillSelect(select, options, allLabel) {
  const key = select.dataset.ramFilter;
  const wanted = options.some((o) => o.value === filters[key]) ? filters[key] : ALL;
  select.innerHTML =
    `<option value="${ALL}">${escapeHtml(allLabel)}</option>` +
    options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  select.value = wanted;
  filters[key] = wanted;
}

function renderFilters() {
  const impactAreas = [
    ...new Set([...currentState.impactAreas.map((i) => i.name), ...currentState.riskRecords.map((r) => r.impactArea).filter(Boolean)]),
  ];
  const ia = document.querySelector('[data-ram-filter="impactArea"]');
  const rt = document.querySelector('[data-ram-filter="recordType"]');
  if (ia) fillSelect(ia, impactAreas.map((v) => ({ value: v, label: v })), t("rr.filter.allImpactAreas"));
  if (rt) fillSelect(rt, RECORD_TYPES.map((v) => ({ value: v, label: tv("recordType", v) })), t("rr.filter.allRecordTypes"));
  const phase = document.querySelector('[data-ram-filter="phase"]');
  if (phase) phase.value = filters.phase;
}

function filteredRecords() {
  return currentState.riskRecords.filter(
    (r) =>
      (filters.impactArea === ALL || r.impactArea === filters.impactArea) &&
      (filters.recordType === ALL || r.recordType === filters.recordType)
  );
}

const SEVERITY_BADGE = { low: "badge-low", medium: "badge-medium", high: "badge-high" };

function render() {
  const matrixEl = document.querySelector("[data-ram-matrix]");
  if (!matrixEl || currentState.status !== "ready") return;
  try {
    renderSummary();
  } catch (err) {
    // Never leave the summary silently blank — say so, and log the cause.
    console.error(err);
    const textEl = document.querySelector("[data-report-narrative]");
    if (textEl) textEl.textContent = t("rep.summary.error");
  }

  // Bins are resolved against the *whole* register, not the filtered
  // subset, so the Cost Impact span matches Configuration and cells
  // don't shift meaning as filters change.
  const bins = resolveBins(parseRamConfig(currentState.settings), currentState.riskRecords);
  const records = filteredRecords();
  const { points, unplotted } = riskPoints(records, filters.phase, bins);
  renderRiskMatrix(matrixEl, bins, points);

  const phaseLabel = t(`phase.${filters.phase}`).toLowerCase();
  document.querySelector("[data-ram-summary]").textContent =
    tn("rep.ram.plotted", points.length, { phase: phaseLabel }) +
    " · " +
    t("rep.ram.matching", { shown: fmtInt(records.length), total: fmtInt(currentState.riskRecords.length) }) +
    (unplotted.length ? " · " + tn("rep.ram.unplotted", unplotted.length, { phase: phaseLabel }) : "") +
    (bins.costOutOfRange ? " · " + t("rep.ram.binsNeedAdjusting") : "");

  const table = document.querySelector("[data-ram-table]");
  const sorted = [...points].sort((a, b) => b.row * 5 + b.col - (a.row * 5 + a.col) || Math.abs(b.cost) - Math.abs(a.cost));
  table.innerHTML = sorted.length
    ? `
    <thead><tr><th>${t("rr.col.id")}</th><th>${t("rr.col.title")}</th><th>${t("rr.col.type")}</th><th>${t("rr.col.status")}</th><th>${t("rr.col.recordType")}</th><th>${t("rr.col.impactArea")}</th><th>${t("dim.likelihood")}</th><th>${t("rep.ram.costImpact")}</th><th>${t("rep.ram.cell")}</th></tr></thead>
    <tbody>${sorted
      .map((p) => {
        const sev = cellSeverity(p.row, p.col);
        return `<tr>
          <td>${escapeHtml(p.record.id)}</td>
          <td>${escapeHtml(p.record.title)}</td>
          <td><span class="badge ${p.record.riskType === "Threat" ? "badge-high" : "badge-low"}">${escapeHtml(tv("riskType", p.record.riskType))}</span></td>
          <td>${escapeHtml(tv("status", p.record.status))}</td>
          <td>${escapeHtml(tv("recordType", p.record.recordType))}</td>
          <td>${escapeHtml(p.record.impactArea)}</td>
          <td>${fmtNum(p.likelihood, 1)}% · ${likelihoodLabel(p.row)}</td>
          <td>${fmtInt(p.cost)} · ${costLabel(p.col)}</td>
          <td><span class="badge ${SEVERITY_BADGE[sev]}">${t(`ram.severity.${sev}`)} (${(p.row + 1) * (p.col + 1)})</span></td>
        </tr>`;
      })
      .join("")}</tbody>`
    : "";
}

function wire() {
  document.querySelectorAll("[data-ram-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      filters[select.dataset.ramFilter] = select.value;
      render();
    });
  });
}

onRegisterChange((state) => {
  currentState = state;
  if (state.status !== "ready") return;
  renderFilters();
  render();
});
onLangChange(() => {
  if (currentState.status !== "ready") return;
  renderFilters();
  render();
});
wire();
