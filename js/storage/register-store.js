// In-memory risk register state, backed by the .xlsx workbook in the
// connected folder. Loads on connect, saves the whole workbook back on
// every mutation (registers here are expected to stay small — tens to
// low hundreds of records — so whole-file rewrites are simple and safe
// rather than needing incremental sheet patching).
import {
  loadWorkbook,
  saveWorkbook,
  getFileLastModified,
  configTemplate,
  riskRecordTemplates,
  validateDistribution,
  calculateAssessment,
  totalCostRange,
  expectedValue,
  nextId,
  DIMENSIONS,
} from "./workbook.js";
import {
  getConnectionState,
  onConnectionChange,
  getDirectoryHandle,
} from "./folder-connection.js";

const PHASES = ["pre", "post"];

// The file's mtime as of our last successful load or save — the only
// signal available (no real locking with File System Access) that
// someone/something else has written to the file since. See
// checkConflict() below.
let knownFileModifiedAt = null;

function emptyState(status) {
  return {
    status,
    rbs: [],
    impactAreas: [],
    owners: [],
    qhseLevels: [],
    riskRecords: [],
    settings: {},
    conflict: false,
  };
}

let state = emptyState("idle");

const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(state);
}

export function getRegisterState() {
  return state;
}

export function onRegisterChange(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function emptyDist() {
  return { min: null, ml: null, max: null, type: null };
}

function rowToDist(row, prefix) {
  const num = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
  return {
    min: num(row[`${prefix}_min`]),
    ml: num(row[`${prefix}_ml`]),
    max: num(row[`${prefix}_max`]),
    type: row[`${prefix}_type`] || null,
  };
}

function rowToRecord(row, actionsRows) {
  const pre = {};
  const post = {};
  for (const dim of DIMENSIONS) {
    pre[dim] = rowToDist(row, `pre_${dim}`);
    post[dim] = rowToDist(row, `post_${dim}`);
  }
  pre.qhse = row.pre_qhse || null;
  post.qhse = row.post_qhse || null;

  return {
    id: row.id,
    title: row.title || "",
    riskType: row.riskType || "Threat",
    recordType: row.recordType || "Regular Pooled Record",
    description: row.description || "",
    cause: row.cause || "",
    effect: row.effect || "",
    owner: row.owner || "",
    impactArea: row.impactArea || "",
    rbsCategory: row.rbsCategory || "",
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || "",
    pre,
    post,
    computed: { pre: calculateAssessment(pre), post: calculateAssessment(post) },
    actions: actionsRows
      .filter((a) => a.riskId === row.id)
      .map((a) => ({ ...a, cost: a.cost === "" ? 0 : Number(a.cost) })),
  };
}

function distToRow(dist, prefix) {
  return {
    [`${prefix}_min`]: dist.min ?? "",
    [`${prefix}_ml`]: dist.ml ?? "",
    [`${prefix}_max`]: dist.max ?? "",
    [`${prefix}_type`]: dist.type ?? "",
  };
}

function recordToRow(record) {
  const preCalc = calculateAssessment(record.pre);
  const postCalc = calculateAssessment(record.post);
  const row = {
    id: record.id,
    title: record.title,
    riskType: record.riskType,
    recordType: record.recordType,
    description: record.description,
    cause: record.cause,
    effect: record.effect,
    owner: record.owner,
    impactArea: record.impactArea,
    rbsCategory: record.rbsCategory,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pre_qhse: record.pre.qhse ?? "",
    post_qhse: record.post.qhse ?? "",
    pre_emv: preCalc.emv,
    pre_scheduleExposure: preCalc.scheduleExposure,
    pre_maxDirectCost: preCalc.maxDirectCost,
    pre_maxKnockOn: preCalc.maxKnockOn,
    pre_maxTotalCost: preCalc.maxTotalCost,
    pre_maxSchedule: preCalc.maxSchedule,
    post_emv: postCalc.emv,
    post_scheduleExposure: postCalc.scheduleExposure,
    post_maxDirectCost: postCalc.maxDirectCost,
    post_maxKnockOn: postCalc.maxKnockOn,
    post_maxTotalCost: postCalc.maxTotalCost,
    post_maxSchedule: postCalc.maxSchedule,
  };
  for (const dim of DIMENSIONS) {
    Object.assign(row, distToRow(record.pre[dim] ?? emptyDist(), `pre_${dim}`));
    Object.assign(row, distToRow(record.post[dim] ?? emptyDist(), `post_${dim}`));
  }
  return row;
}

function actionsToRows(riskRecords) {
  return riskRecords.flatMap((r) =>
    (r.actions ?? []).map((a) => ({ ...a, riskId: r.id }))
  );
}

// Checks whether the file on disk has changed since we last read or
// wrote it. Returns true (and flags state.conflict) if so — callers
// must check this *before* applying an optimistic mutation, not after,
// so a blocked save never leaves the in-memory state showing a change
// that isn't actually on disk. This is a check-then-act race like any
// lock-free approach (the file could still change in the gap between
// this check and the write), but File System Access has no real
// locking primitive, so this is the best available signal.
async function checkConflict() {
  const handle = getDirectoryHandle();
  if (!handle) return false;
  const current = await getFileLastModified(handle);
  if (knownFileModifiedAt !== null && current !== knownFileModifiedAt) {
    state = { ...state, conflict: true };
    notify();
    return true;
  }
  return false;
}

async function persist() {
  const handle = getDirectoryHandle();
  if (!handle) return;
  await saveWorkbook(handle, {
    rbs: state.rbs,
    impactAreas: state.impactAreas,
    owners: state.owners,
    qhseLevels: state.qhseLevels,
    riskRecords: state.riskRecords.map(recordToRow),
    actions: actionsToRows(state.riskRecords),
    settings: state.settings,
  });
  // Our own write just changed the file's mtime — record that as
  // "known" so it isn't mistaken for an external change next time.
  knownFileModifiedAt = await getFileLastModified(handle);
}

async function load() {
  const handle = getDirectoryHandle();
  if (!handle) return;
  state = { ...state, status: "loading" };
  notify();
  try {
    const data = await loadWorkbook(handle);
    knownFileModifiedAt = await getFileLastModified(handle);
    state = {
      status: "ready",
      rbs: data.rbs,
      impactAreas: data.impactAreas,
      owners: data.owners,
      qhseLevels: data.qhseLevels,
      riskRecords: data.riskRecords.map((row) => rowToRecord(row, data.actions)),
      settings: data.settings ?? {},
      conflict: false,
    };
  } catch (err) {
    state = { ...state, status: "error" };
  }
  notify();
}

onConnectionChange((connection) => {
  if (connection.status === "connected") {
    load();
  } else if (state.status !== "idle") {
    knownFileModifiedAt = null;
    state = emptyState("idle");
    notify();
  }
});

// --- Config -----------------------------------------------------------
export async function applyConfigTemplate() {
  if (await checkConflict()) return false;
  const template = configTemplate();
  state = { ...state, ...template };
  notify();
  await persist();
  return true;
}

function namedListMutators(key) {
  return {
    async add(name) {
      if (await checkConflict()) return false;
      const list = state[key];
      const id = nextId(list, key.slice(0, 4));
      state = { ...state, [key]: [...list, { id, name }] };
      notify();
      await persist();
      return true;
    },
    async remove(id) {
      if (await checkConflict()) return false;
      state = { ...state, [key]: state[key].filter((item) => item.id !== id) };
      notify();
      await persist();
      return true;
    },
  };
}

export const rbsList = namedListMutators("rbs");
export const impactAreaList = namedListMutators("impactAreas");
export const ownerList = namedListMutators("owners");
export const qhseLevelList = namedListMutators("qhseLevels");

// --- Settings (available budget, last modelling run) -------------------
export async function updateSettings(patch) {
  if (await checkConflict()) return false;
  state = { ...state, settings: { ...state.settings, ...patch } };
  notify();
  await persist();
  return true;
}

// --- Risk records -------------------------------------------------------
function blankAssessment() {
  const a = { qhse: null };
  for (const dim of DIMENSIONS) a[dim] = emptyDist();
  return a;
}

export function blankRiskRecord() {
  return {
    id: null,
    title: "",
    riskType: "Threat",
    recordType: "Regular Pooled Record",
    description: "",
    cause: "",
    effect: "",
    owner: "",
    impactArea: "",
    rbsCategory: "",
    createdAt: "",
    updatedAt: "",
    pre: blankAssessment(),
    post: blankAssessment(),
    computed: { pre: calculateAssessment(blankAssessment()), post: calculateAssessment(blankAssessment()) },
    actions: [],
  };
}

function allActions() {
  return state.riskRecords.flatMap((r) => r.actions ?? []);
}

function withFinalizedActionIds(actions) {
  const pool = [...allActions()];
  return actions.map((action) => {
    if (action.id && !action.id.startsWith("local-")) return action;
    const id = nextId(pool, "A");
    pool.push({ id });
    return { ...action, id };
  });
}

export async function saveRiskRecord(record) {
  if (await checkConflict()) return false;
  const now = new Date().toISOString();
  const isNew = !record.id;
  const withComputed = (r) => ({
    ...r,
    actions: withFinalizedActionIds(r.actions ?? []),
    computed: { pre: calculateAssessment(r.pre), post: calculateAssessment(r.post) },
  });

  if (isNew) {
    const id = nextId(state.riskRecords, "R");
    const record2 = withComputed({ ...record, id, createdAt: now, updatedAt: now });
    state = { ...state, riskRecords: [...state.riskRecords, record2] };
  } else {
    const record2 = withComputed({ ...record, updatedAt: now });
    state = {
      ...state,
      riskRecords: state.riskRecords.map((r) => (r.id === record.id ? record2 : r)),
    };
  }
  notify();
  await persist();
  return true;
}

export async function deleteRiskRecord(id) {
  if (await checkConflict()) return false;
  state = { ...state, riskRecords: state.riskRecords.filter((r) => r.id !== id) };
  notify();
  await persist();
  return true;
}

export async function loadRiskRecordTemplate(index) {
  const templates = riskRecordTemplates();
  const template = templates[index];
  if (!template) return null;
  const record = blankRiskRecord();
  return saveRiskRecord({
    ...record,
    ...template,
    actions: (template.actions ?? []).map((a, i) => ({ id: `local-${i}`, ...a })),
  });
}

export function createLocalAction() {
  return {
    id: `local-${Math.random().toString(36).slice(2, 10)}`,
    title: "",
    owner: "",
    strategy: "",
    dueDate: "",
    cost: 0,
  };
}

export { validateDistribution, calculateAssessment, totalCostRange, expectedValue, DIMENSIONS, PHASES };

// Re-run the connection check in case the folder was already connected
// before this module loaded (module load order across scripts on a page).
if (getConnectionState().status === "connected") load();
