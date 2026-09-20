// Reads/writes the project's risk register as a real .xlsx workbook in
// the connected folder, using the vendored SheetJS build (window.XLSX,
// loaded via a plain <script> tag — see js/vendor/xlsx.full.min.js).
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
  "description",
  "cause",
  "effect",
  "owner",
  "impactArea",
  "rbsCategory",
  "createdAt",
  "updatedAt",
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
export const QHSE_LEVEL_NAMES = ["Negligible", "Minor", "Medium", "Major", "Catastrophic"];

export function configTemplate() {
  return {
    rbs: [
      { id: "rbs-1", name: "Design" },
      { id: "rbs-2", name: "Procurement" },
      { id: "rbs-3", name: "Construction" },
      { id: "rbs-4", name: "Commissioning" },
    ],
    impactAreas: [
      { id: "ia-1", name: "CAPEX" },
      { id: "ia-2", name: "OPEX" },
      { id: "ia-3", name: "Revenue" },
    ],
    owners: [
      { id: "own-1", name: "Project Manager" },
      { id: "own-2", name: "Risk Manager" },
    ],
    qhseLevels: QHSE_LEVEL_NAMES.map((name, i) => ({ id: `qhse-${i + 1}`, name })),
  };
}

// Fixed enum, unlike RBS/Impact Areas/Owners/QHSE Levels which are
// user-configurable named lists.
export const RECORD_TYPES = ["Regular Pooled Record", "High Impact", "Benchmark"];

// --- Risk record templates -------------------------------------------
function distribution(min, ml, max, type) {
  return { min, ml, max, type };
}

export function riskRecordTemplates() {
  const now = new Date().toISOString();
  return [
    {
      title: "Delay in long-lead equipment delivery",
      riskType: "Threat",
      recordType: "High Impact",
      description:
        "Key equipment sourced from a single supplier may arrive later than the baseline schedule.",
      cause: "Single-source supplier with limited manufacturing capacity.",
      effect: "Downstream installation and commissioning activities delayed.",
      owner: "Project Manager",
      impactArea: "CAPEX",
      rbsCategory: "Procurement",
      createdAt: now,
      updatedAt: now,
      pre: {
        likelihood: distribution(20, 35, 50, "triangular"),
        costImpact: distribution(20000, 45000, 80000, "triangular"),
        knockOn: distribution(5000, 15000, 30000, "triangular"),
        scheduleImpact: distribution(10, 20, 40, "triangular"),
        qhse: "Minor",
      },
      post: {
        likelihood: distribution(null, 15, null, "single-point"),
        costImpact: distribution(10000, 20000, 35000, "triangular"),
        knockOn: distribution(2000, 5000, 10000, "triangular"),
        scheduleImpact: distribution(5, 10, 15, "triangular"),
        qhse: "Negligible",
      },
      actions: [
        {
          title: "Qualify a second supplier",
          owner: "Procurement Lead",
          strategy: "Mitigate",
          dueDate: "",
          cost: 8000,
        },
      ],
    },
    {
      title: "Faster-than-planned regulatory approval",
      riskType: "Opportunity",
      recordType: "Regular Pooled Record",
      description:
        "The permitting authority may clear the application ahead of the standard review cycle.",
      cause: "Application submitted early with full supporting documentation.",
      effect: "Site works could start ahead of schedule, reducing financing costs.",
      owner: "Risk Manager",
      impactArea: "OPEX",
      rbsCategory: "Design",
      createdAt: now,
      updatedAt: now,
      pre: {
        likelihood: distribution(10, 20, 30, "triangular"),
        costImpact: distribution(-15000, -8000, -2000, "triangular"),
        knockOn: distribution(null, 0, null, "single-point"),
        scheduleImpact: distribution(-15, -8, -2, "triangular"),
        qhse: "Negligible",
      },
      post: {
        likelihood: distribution(null, 20, null, "single-point"),
        costImpact: distribution(-15000, -8000, -2000, "triangular"),
        knockOn: distribution(null, 0, null, "single-point"),
        scheduleImpact: distribution(-15, -8, -2, "triangular"),
        qhse: "Negligible",
      },
      actions: [
        {
          title: "Pre-brief the permitting authority",
          owner: "Risk Manager",
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
        : { valid: false, type: null, message: "Max must be greater than Min for a uniform range." };
  } else if (hasMin && hasMl && hasMax) {
    result =
      min < ml && ml < max
        ? { valid: true, type: "triangular" }
        : {
            valid: false,
            type: null,
            message: "Min, Most Likely and Max must be strictly increasing for a triangular range.",
          };
  } else if (!hasMin && !hasMl && !hasMax) {
    result = { valid: false, type: null, message: "Enter at least a Most Likely value.", empty: true };
  } else {
    result = {
      valid: false,
      type: null,
      message:
        "Enter Most Likely only (single point), Min & Max only (uniform), or Min, Most Likely & Max (triangular).",
    };
  }

  if (result.valid && bounds) {
    const values = [min, ml, max].filter(isFiniteNumber);
    if (values.some((v) => v < bounds.min || v > bounds.max)) {
      return {
        valid: false,
        type: null,
        message: `Enter values between ${bounds.min} and ${bounds.max}.`,
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

export function nextId(records, prefix) {
  const nums = records
    .map((r) => parseInt(String(r.id ?? "").replace(`${prefix}-`, ""), 10))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}
