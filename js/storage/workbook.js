// Reads/writes the project's risk register as a real .xlsx workbook in
// the connected folder, using the vendored SheetJS build (window.XLSX,
// loaded via a plain <script> tag — see js/vendor/xlsx.full.min.js).
import { t } from "../i18n/i18n.js";

export const WORKBOOK_FILENAME = "risk-register.xlsx";

const SHEETS = {
  rbs: "RBS",
  impactAreas: "ImpactAreas",
  owners: "Owners",
  qhseLevels: "QHSELevels",
  riskRecords: "RiskRegister",
  actions: "Actions",
  settings: "Settings",
};

// The 4 quantitative (Min/ML/Max) assessment dimensions. QHSE is a
// separate qualitative field (a level name), not part of this list —
// see RECORD_TYPES / QHSE handling below and in js/pages/risk-register.js.
export const DIMENSIONS = ["likelihood", "costImpact", "knockOn", "scheduleImpact"];

const RISK_RECORD_COLUMNS = [
  "id",
  "title",
  "riskType",
  "recordType",
  "status",
  "description",
  "cause",
  "effect",
  "owner",
  "impactArea",
  "rbsCategory",
  "createdAt",
  "updatedAt",
  "lastActionNumber",
  ...["pre", "post"].flatMap((phase) => [
    ...DIMENSIONS.flatMap((dim) => [
      `${phase}_${dim}_min`,
      `${phase}_${dim}_ml`,
      `${phase}_${dim}_max`,
      `${phase}_${dim}_type`,
    ]),
    `${phase}_qhse`,
  ]),
  "pre_emv",
  "pre_scheduleExposure",
  "pre_maxDirectCost",
  "pre_maxKnockOn",
  "pre_maxTotalCost",
  "pre_maxSchedule",
  "post_emv",
  "post_scheduleExposure",
  "post_maxDirectCost",
  "post_maxKnockOn",
  "post_maxTotalCost",
  "post_maxSchedule",
];

const ACTION_COLUMNS = [
  "id",
  "riskId",
  "title",
  "owner",
  "strategy",
  "dueDate",
  "cost",
];

const NAMED_LIST_COLUMNS = ["id", "name"];
const SETTINGS_COLUMNS = [
  "availableBudget",
  "lastModelledAt",
  "lastModelledTrials",
  "lastModelledResultsJson",
  "ramJson",
  "lastRiskNumber",
  "requiredFieldsJson",
];

function emptyRegister() {
  return {
    rbs: [],
    impactAreas: [],
    owners: [],
    qhseLevels: [],
    riskRecords: [],
    actions: [],
    settings: {},
  };
}

function sheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export async function fileExists(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

// Used for optimistic-concurrency conflict detection (register-store.js):
// null means the file doesn't exist yet (e.g. a fresh folder before the
// first save). File System Access has no locking, so this is the only
// signal available that someone/something else has written to the file
// since we last read it.
export async function getFileLastModified(dirHandle) {
  if (!(await fileExists(dirHandle, WORKBOOK_FILENAME))) return null;
  const fileHandle = await dirHandle.getFileHandle(WORKBOOK_FILENAME);
  const file = await fileHandle.getFile();
  return file.lastModified;
}

export async function loadWorkbook(dirHandle) {
  if (!(await fileExists(dirHandle, WORKBOOK_FILENAME))) {
    return emptyRegister();
  }
  const fileHandle = await dirHandle.getFileHandle(WORKBOOK_FILENAME);
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });

  const settingsRows = sheetToRows(workbook, SHEETS.settings);

  return {
    rbs: sheetToRows(workbook, SHEETS.rbs),
    impactAreas: sheetToRows(workbook, SHEETS.impactAreas),
    owners: sheetToRows(workbook, SHEETS.owners),
    qhseLevels: sheetToRows(workbook, SHEETS.qhseLevels),
    riskRecords: sheetToRows(workbook, SHEETS.riskRecords),
    actions: sheetToRows(workbook, SHEETS.actions),
    settings: settingsRows[0] ?? {},
  };
}

export async function saveWorkbook(dirHandle, data) {
  const workbook = window.XLSX.utils.book_new();
  const addSheet = (rows, sheetName, columns) => {
    const sheet = window.XLSX.utils.json_to_sheet(rows, { header: columns });
    window.XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  };

  addSheet(data.rbs, SHEETS.rbs, NAMED_LIST_COLUMNS);
  addSheet(data.impactAreas, SHEETS.impactAreas, NAMED_LIST_COLUMNS);
  addSheet(data.owners, SHEETS.owners, NAMED_LIST_COLUMNS);
  addSheet(data.qhseLevels, SHEETS.qhseLevels, NAMED_LIST_COLUMNS);
  addSheet(data.riskRecords, SHEETS.riskRecords, RISK_RECORD_COLUMNS);
  addSheet(data.actions, SHEETS.actions, ACTION_COLUMNS);
  addSheet([data.settings ?? {}], SHEETS.settings, SETTINGS_COLUMNS);

  const arrayBuffer = window.XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const fileHandle = await dirHandle.getFileHandle(WORKBOOK_FILENAME, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(arrayBuffer);
  await writable.close();
}

// --- Config template -------------------------------------------------
// Template names are created in the language selected at the time
// (they're ordinary user data afterwards — switching the UI language
// doesn't rename them). The risk record templates reference the same
// names, so loading both in one language keeps their owners/categories
// matching the configured lists.
const QHSE_LEVEL_KEYS = ["negligible", "minor", "medium", "major", "catastrophic"];

export function configTemplate() {
  const named = (prefix, keys, idPrefix) =>
    keys.map((k, i) => ({ id: `${idPrefix}-${i + 1}`, name: t(`tpl.${prefix}.${k}`) }));
  return {
    rbs: named("rbs", ["design", "procurement", "construction", "commissioning"], "rbs"),
    impactAreas: named("impactArea", ["capex", "opex", "revenue"], "ia"),
    owners: named("owner", ["projectManager", "riskManager"], "own"),
    qhseLevels: named("qhse", QHSE_LEVEL_KEYS, "qhse"),
  };
}

// Fixed enums, unlike RBS/Impact Areas/Owners/QHSE Levels which are
// user-configurable named lists. Stored in English in the workbook
// whatever the UI language; displayed via tv("recordType"|"status", v).
export const RECORD_TYPES = ["Regular Pooled Record", "High Impact", "Benchmark"];
export const POOLED_RECORD_TYPE = "Regular Pooled Record";
export const RISK_TYPES = ["Threat", "Opportunity"];

// Risk record lifecycle. Only "Open" risks are live exposure: Monte
// Carlo models Open + Regular Pooled Record only; Draft and Proposed
// count as "under review" (not yet accepted into the register); the
// Closed variants record how the risk ended. Rows saved before Status
// existed load as "Open", so existing registers model exactly as before.
export const RISK_STATUSES = [
  "Open",
  "Draft",
  "Proposed",
  "Closed - Rejected",
  "Closed - Impacted",
  "Closed - Mitigated",
  "Closed - Expired",
];
export const DEFAULT_STATUS = "Open";
export const REVIEW_STATUSES = ["Draft", "Proposed"];

export function isClosedStatus(status) {
  return String(status ?? "").startsWith("Closed");
}

// --- Required fields of the risk record form -------------------------
// Chosen on the Configuration page, stored as settings.requiredFieldsJson
// (a JSON array of the keys below). "id" is always required — it's the
// record's key. Default: ID, Title, Record Type, Status, Owner (new
// records start with Risk Type, Record Type and Status blank, so these
// are real choices). Assessment keys are "<phase>.<dimension>" (a
// distribution counts as filled when any of Min/ML/Max is entered) or
// "<phase>.qhse".
export const REQUIRED_FIELD_GROUPS = [
  {
    group: "details",
    keys: ["id", "title", "riskType", "recordType", "status", "owner", "impactArea", "rbsCategory", "description", "cause", "effect"],
  },
  ...["pre", "post"].map((phase) => ({
    group: phase,
    keys: [...DIMENSIONS, "qhse"].map((dim) => `${phase}.${dim}`),
  })),
];
export const ALWAYS_REQUIRED = ["id"];
export const DEFAULT_REQUIRED_FIELDS = ["id", "title", "recordType", "status", "owner"];
const ALL_REQUIRED_KEYS = new Set(REQUIRED_FIELD_GROUPS.flatMap((g) => g.keys));

export function parseRequiredFields(settings) {
  let list = null;
  try {
    list = settings?.requiredFieldsJson ? JSON.parse(settings.requiredFieldsJson) : null;
  } catch {
    list = null;
  }
  const keys = Array.isArray(list) ? list.filter((k) => ALL_REQUIRED_KEYS.has(k)) : DEFAULT_REQUIRED_FIELDS;
  return new Set([...ALWAYS_REQUIRED, ...keys]);
}

export function serializeRequiredFields(set) {
  return JSON.stringify([...set].filter((k) => ALL_REQUIRED_KEYS.has(k)));
}

// --- Risk record templates -------------------------------------------
function distribution(min, ml, max, type) {
  return { min, ml, max, type };
}

export function riskRecordTemplates() {
  const now = new Date().toISOString();
  return [
    {
      title: t("tpl.threat.title"),
      riskType: "Threat",
      recordType: "Regular Pooled Record",
      status: "Open",
      description: t("tpl.threat.description"),
      cause: t("tpl.threat.cause"),
      effect: t("tpl.threat.effect"),
      owner: t("tpl.owner.projectManager"),
      impactArea: t("tpl.impactArea.capex"),
      rbsCategory: t("tpl.rbs.procurement"),
      createdAt: now,
      updatedAt: now,
      pre: {
        likelihood: distribution(20, 35, 50, "triangular"),
        costImpact: distribution(20000, 45000, 80000, "triangular"),
        knockOn: distribution(5000, 15000, 30000, "triangular"),
        scheduleImpact: distribution(10, 20, 40, "triangular"),
        qhse: t("tpl.qhse.minor"),
      },
      post: {
        likelihood: distribution(null, 15, null, "single-point"),
        costImpact: distribution(10000, 20000, 35000, "triangular"),
        knockOn: distribution(2000, 5000, 10000, "triangular"),
        scheduleImpact: distribution(5, 10, 15, "triangular"),
        qhse: t("tpl.qhse.negligible"),
      },
      actions: [
        {
          title: t("tpl.threat.action"),
          owner: t("tpl.owner.procurementLead"),
          strategy: "Mitigate",
          dueDate: "",
          cost: 8000,
        },
      ],
    },
    {
      title: t("tpl.opportunity.title"),
      riskType: "Opportunity",
      recordType: "Regular Pooled Record",
      status: "Open",
      description: t("tpl.opportunity.description"),
      cause: t("tpl.opportunity.cause"),
      effect: t("tpl.opportunity.effect"),
      owner: t("tpl.owner.riskManager"),
      impactArea: t("tpl.impactArea.opex"),
      rbsCategory: t("tpl.rbs.design"),
      createdAt: now,
      updatedAt: now,
      pre: {
        likelihood: distribution(10, 20, 30, "triangular"),
        costImpact: distribution(-15000, -8000, -2000, "triangular"),
        knockOn: distribution(null, 0, null, "single-point"),
        scheduleImpact: distribution(-15, -8, -2, "triangular"),
        qhse: t("tpl.qhse.negligible"),
      },
      post: {
        likelihood: distribution(null, 20, null, "single-point"),
        costImpact: distribution(-15000, -8000, -2000, "triangular"),
        knockOn: distribution(null, 0, null, "single-point"),
        scheduleImpact: distribution(-15, -8, -2, "triangular"),
        qhse: t("tpl.qhse.negligible"),
      },
      actions: [
        {
          title: t("tpl.opportunity.action"),
          owner: t("tpl.owner.riskManager"),
          strategy: "Enhance",
          dueDate: "",
          cost: 0,
        },
      ],
    },
  ];
}

// --- Distribution validation & EMV ------------------------------------
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// `bounds`, when given (e.g. { min: 1, max: 100 } for Likelihood), is
// checked only after the shape itself is valid — a shape error takes
// priority so the user fixes one thing at a time.
export function validateDistribution({ min, ml, max }, bounds) {
  const hasMin = isFiniteNumber(min);
  const hasMl = isFiniteNumber(ml);
  const hasMax = isFiniteNumber(max);

  let result;
  if (hasMl && !hasMin && !hasMax) {
    result = { valid: true, type: "single-point" };
  } else if (hasMin && hasMax && !hasMl) {
    result =
      max > min
        ? { valid: true, type: "uniform" }
        : { valid: false, type: null, message: t("dist.error.uniform") };
  } else if (hasMin && hasMl && hasMax) {
    result =
      min < ml && ml < max
        ? { valid: true, type: "triangular" }
        : {
            valid: false,
            type: null,
            message: t("dist.error.triangular"),
          };
  } else if (!hasMin && !hasMl && !hasMax) {
    result = { valid: false, type: null, message: t("dist.error.empty"), empty: true };
  } else {
    result = {
      valid: false,
      type: null,
      message: t("dist.error.shape"),
    };
  }

  if (result.valid && bounds) {
    const values = [min, ml, max].filter(isFiniteNumber);
    // Either side may be open (e.g. { min: 0 } = "no negatives").
    const outside = (v) => (bounds.min != null && v < bounds.min) || (bounds.max != null && v > bounds.max);
    if (values.some(outside)) {
      return {
        valid: false,
        type: null,
        message: bounds.message ?? t("dist.error.bounds", { min: bounds.min, max: bounds.max }),
      };
    }
  }
  return result;
}

export function expectedValue(dist) {
  if (!dist) return 0;
  const { min, ml, max, type } = dist;
  if (type === "single-point") return ml ?? 0;
  if (type === "uniform") return ((min ?? 0) + (max ?? 0)) / 2;
  if (type === "triangular") return ((min ?? 0) + (ml ?? 0) + (max ?? 0)) / 3;
  return 0;
}

export function maxValue(dist) {
  if (!dist) return 0;
  return dist.max ?? dist.ml ?? 0;
}

// Likelihood is a % (1-100) — divide by 100 to use as a probability
// weight. EMV is calculated only for Total Cost (Direct Cost + Knock
// On), per the user's spec; Schedule and QHSE are tracked separately
// and don't feed into it. Knock On is treated as an indirect/downstream
// cost impact, distinct from Direct Cost — the "knock-on cost"
// convention from Primavera Risk Analysis (documented assumption, see
// CLAUDE.md "Architecture" — correct here if that's not the intent).
export function calculateAssessment(assessment) {
  const likelihoodFraction = expectedValue(assessment.likelihood) / 100;
  const directCostEv = expectedValue(assessment.costImpact);
  const knockOnEv = expectedValue(assessment.knockOn);
  const totalCostEv = directCostEv + knockOnEv;
  const scheduleEv = expectedValue(assessment.scheduleImpact);

  const maxDirectCost = maxValue(assessment.costImpact);
  const maxKnockOn = maxValue(assessment.knockOn);

  return {
    directCostEv,
    knockOnEv,
    totalCostEv,
    emv: likelihoodFraction * totalCostEv,
    scheduleExposure: likelihoodFraction * scheduleEv,
    maxDirectCost,
    maxKnockOn,
    maxTotalCost: maxDirectCost + maxKnockOn,
    maxSchedule: maxValue(assessment.scheduleImpact),
  };
}

// Read-only Total Cost summary (Min/Expected/Max) shown above the Direct
// Cost + Knock On groups. Falls back min/max to ML when a component is a
// single point, so the summed range still makes sense even when the two
// components use different distribution shapes.
export function totalCostRange(assessment) {
  const lo = (d) => (d?.min ?? d?.ml ?? 0);
  const hi = (d) => (d?.max ?? d?.ml ?? 0);
  const directCost = assessment.costImpact;
  const knockOn = assessment.knockOn;
  return {
    min: lo(directCost) + lo(knockOn),
    ev: expectedValue(directCost) + expectedValue(knockOn),
    max: hi(directCost) + hi(knockOn),
  };
}

// --- Risk & action IDs ---------------------------------------------------
// Risk IDs are user-editable but must be unique (case-insensitive) and
// safe: starts with a letter/digit (so a hand-edited "=..." / "+..." /
// "@..." id can never act as a spreadsheet formula), then letters,
// digits, "-", "_" or ".", max 32 chars. Auto-assigned ids are
// R-0001, R-0002, ... and are never reissued after deletion
// (settings.lastRiskNumber is a high-water mark).
//
// Action IDs are hierarchical, derived from their risk:
// "<riskId>-A-001" (zero-padded 3-digit sequence per risk, also a
// never-reused high-water mark: the record's lastActionNumber).
export const RISK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export function riskIdError(id, riskRecords, originalId = null) {
  const value = String(id ?? "").trim();
  if (!value) return t("riskId.error.required");
  if (!RISK_ID_PATTERN.test(value)) return t("riskId.error.pattern");
  const clash = riskRecords.find(
    (r) => r.id && r.id.toLowerCase() === value.toLowerCase() && r.id !== originalId
  );
  if (clash) return t("riskId.error.duplicate", { id: value, title: clash.title });
  return null;
}

function autoRiskNumber(id) {
  const m = /^R-(\d+)$/i.exec(String(id ?? ""));
  return m ? parseInt(m[1], 10) : 0;
}

export function highestRiskNumber(riskRecords, lastRiskNumber = 0) {
  return Math.max(Number(lastRiskNumber) || 0, 0, ...riskRecords.map((r) => autoRiskNumber(r.id)));
}

// Next free auto id, skipping any number already taken (e.g. by a
// custom id that happens to look like "R-0007").
export function nextRiskId(riskRecords, lastRiskNumber = 0) {
  const taken = new Set(riskRecords.map((r) => String(r.id ?? "").toLowerCase()));
  let n = highestRiskNumber(riskRecords, lastRiskNumber) + 1;
  while (taken.has(`r-${String(n).padStart(4, "0")}`)) n++;
  return `R-${String(n).padStart(4, "0")}`;
}

export function actionId(riskId, number) {
  return `${riskId}-A-${String(number).padStart(3, "0")}`;
}

// Sequence number of an action id that belongs to riskId, else null.
export function actionNumber(riskId, id) {
  const prefix = `${riskId}-A-`;
  if (!riskId || typeof id !== "string" || !id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
}

export function nextId(records, prefix) {
  const nums = records
    .map((r) => parseInt(String(r.id ?? "").replace(`${prefix}-`, ""), 10))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}
