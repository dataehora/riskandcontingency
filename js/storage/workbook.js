// Reads/writes the project's risk register as a real .xlsx workbook in
// the connected folder, using the vendored SheetJS build (window.XLSX,
// loaded via a plain <script> tag — see js/vendor/xlsx.full.min.js).
export const WORKBOOK_FILENAME = "risk-register.xlsx";

const SHEETS = {
  rbs: "RBS",
  impactAreas: "ImpactAreas",
  owners: "Owners",
  riskRecords: "RiskRegister",
  actions: "Actions",
};

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
  ...["pre", "post"].flatMap((phase) =>
    ["likelihood", "costImpact", "knockOn", "scheduleImpact"].flatMap((dim) => [
      `${phase}_${dim}_min`,
      `${phase}_${dim}_ml`,
      `${phase}_${dim}_max`,
      `${phase}_${dim}_type`,
    ])
  ),
  "pre_emv",
  "pre_maxCostImpact",
  "pre_scheduleExposure",
  "pre_scheduleMaxImpact",
  "post_emv",
  "post_maxCostImpact",
  "post_scheduleExposure",
  "post_scheduleMaxImpact",
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

function emptyRegister() {
  return { rbs: [], impactAreas: [], owners: [], riskRecords: [], actions: [] };
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

  return {
    rbs: sheetToRows(workbook, SHEETS.rbs),
    impactAreas: sheetToRows(workbook, SHEETS.impactAreas),
    owners: sheetToRows(workbook, SHEETS.owners),
    riskRecords: sheetToRows(workbook, SHEETS.riskRecords),
    actions: sheetToRows(workbook, SHEETS.actions),
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
  addSheet(data.riskRecords, SHEETS.riskRecords, RISK_RECORD_COLUMNS);
  addSheet(data.actions, SHEETS.actions, ACTION_COLUMNS);

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
  };
}

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
        likelihood: distribution(0.2, 0.35, 0.5, "triangular"),
        costImpact: distribution(20000, 45000, 80000, "triangular"),
        knockOn: distribution(5000, 15000, 30000, "triangular"),
        scheduleImpact: distribution(10, 20, 40, "triangular"),
      },
      post: {
        likelihood: distribution(null, 0.15, null, "single-point"),
        costImpact: distribution(10000, 20000, 35000, "triangular"),
        knockOn: distribution(2000, 5000, 10000, "triangular"),
        scheduleImpact: distribution(5, 10, 15, "triangular"),
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
      recordType: "Pooled",
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
        likelihood: distribution(0.1, 0.2, 0.3, "triangular"),
        costImpact: distribution(-15000, -8000, -2000, "triangular"),
        knockOn: distribution(null, 0, null, "single-point"),
        scheduleImpact: distribution(-15, -8, -2, "triangular"),
      },
      post: {
        likelihood: distribution(null, 0.2, null, "single-point"),
        costImpact: distribution(-15000, -8000, -2000, "triangular"),
        knockOn: distribution(null, 0, null, "single-point"),
        scheduleImpact: distribution(-15, -8, -2, "triangular"),
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

export function validateDistribution({ min, ml, max }) {
  const hasMin = isFiniteNumber(min);
  const hasMl = isFiniteNumber(ml);
  const hasMax = isFiniteNumber(max);

  if (hasMl && !hasMin && !hasMax) {
    return { valid: true, type: "single-point" };
  }
  if (hasMin && hasMax && !hasMl) {
    if (max > min) return { valid: true, type: "uniform" };
    return {
      valid: false,
      type: null,
      message: "Max must be greater than Min for a uniform range.",
    };
  }
  if (hasMin && hasMl && hasMax) {
    if (min < ml && ml < max) return { valid: true, type: "triangular" };
    return {
      valid: false,
      type: null,
      message:
        "Min, Most Likely and Max must be strictly increasing for a triangular range.",
    };
  }
  if (!hasMin && !hasMl && !hasMax) {
    return { valid: false, type: null, message: "Enter at least a Most Likely value.", empty: true };
  }
  return {
    valid: false,
    type: null,
    message:
      "Enter Most Likely only (single point), Min & Max only (uniform), or Min, Most Likely & Max (triangular).",
  };
}

export function expectedValue(dist) {
  if (!dist) return 0;
  const { min, ml, max, type } = dist;
  if (type === "single-point") return ml ?? 0;
  if (type === "uniform") return ((min ?? 0) + (max ?? 0)) / 2;
  if (type === "triangular") return ((min ?? 0) + (ml ?? 0) + (max ?? 0)) / 3;
  return 0;
}

function maxValue(dist) {
  if (!dist) return 0;
  return dist.max ?? dist.ml ?? 0;
}

// EMV (cost) = Likelihood x (Cost Impact + Knock On). Knock On is treated
// as an indirect/downstream cost impact distinct from the direct Cost
// Impact — see CLAUDE.md "Architecture" for the reasoning; this is a
// documented assumption, adjust here if that's not the intent.
export function calculateAssessment(assessment) {
  const likelihoodEv = expectedValue(assessment.likelihood);
  const costEv = expectedValue(assessment.costImpact) + expectedValue(assessment.knockOn);
  const scheduleEv = expectedValue(assessment.scheduleImpact);

  return {
    emv: likelihoodEv * costEv,
    maxCostImpact: maxValue(assessment.costImpact) + maxValue(assessment.knockOn),
    scheduleExposure: likelihoodEv * scheduleEv,
    scheduleMaxImpact: maxValue(assessment.scheduleImpact),
  };
}

export function nextId(records, prefix) {
  const nums = records
    .map((r) => parseInt(String(r.id ?? "").replace(`${prefix}-`, ""), 10))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}
