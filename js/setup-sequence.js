// Renders the 4-step setup sequence into any [data-setup-sequence]
// container (Home page only, by design) and gates page content on every
// page behind [data-requires-step="N"] / [data-step-locked-notice="N"]
// (N is 1-4, matching STEPS below) so a step's UI never appears before
// its prerequisites are met.
import { getConnectionState, onConnectionChange } from "./storage/folder-connection.js";
import { getRegisterState, onRegisterChange } from "./storage/register-store.js";

export const STEPS = [
  { key: "folder", label: "Select folder", page: "/" },
  { key: "config", label: "Create config file", page: "/configuration.html" },
  { key: "risk-record", label: "Create risk record", page: "/risk-register.html" },
  { key: "modelling", label: "Run modelling", page: "/modelling.html" },
];

const DISMISSED_KEY = "setup-sequence-dismissed";

function isDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function setDismissed(value) {
  try {
    if (value) localStorage.setItem(DISMISSED_KEY, "true");
    else localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Storage unavailable — dismissal just won't persist this session.
  }
}

export function computeStepStatus() {
  const connection = getConnectionState();
  const register = getRegisterState();

  const folderDone = connection.status === "connected";
  const configDone =
    folderDone &&
    register.status === "ready" &&
    (register.rbs.length > 0 ||
      register.impactAreas.length > 0 ||
      register.owners.length > 0 ||
      register.qhseLevels.length > 0);
  const riskRecordDone = configDone && register.riskRecords.length > 0;
  const modellingDone = riskRecordDone && !!register.settings?.lastModelledAt;

  return [folderDone, configDone, riskRecordDone, modellingDone];
}

function renderSequence(doneFlags) {
  const containers = document.querySelectorAll("[data-setup-sequence]");
  if (!containers.length) return;

  const allDone = doneFlags.every(Boolean);

  // Only a completed sequence can be dismissed; as soon as it's no
  // longer complete (e.g. a different, emptier folder gets connected),
  // any previous dismissal is cleared so the guidance reappears.
  if (!allDone) setDismissed(false);

  if (allDone && isDismissed()) {
    containers.forEach((el) => {
      el.innerHTML = "";
    });
    return;
  }

  const firstNotDone = doneFlags.findIndex((d) => !d);

  const html = `
    <div class="setup-sequence">
      <div class="setup-sequence-header">
        <span class="eyebrow">Setup sequence</span>
        ${allDone ? `<button type="button" class="btn btn-ghost btn-sm" data-dismiss-setup-sequence aria-label="Dismiss setup sequence">Dismiss &times;</button>` : ""}
      </div>
      <ol class="setup-steps">
        ${STEPS.map((step, i) => {
          const done = doneFlags[i];
          const locked = i > 0 && !doneFlags[i - 1];
          const isCurrent = i === firstNotDone;
          const state = done ? "done" : locked ? "locked" : isCurrent ? "current" : "";
          return `<li class="setup-step" data-state="${state}">
            <span class="setup-step-index" aria-hidden="true">${done ? "&#10003;" : i + 1}</span>
            ${
              locked
                ? `<span class="setup-step-label">${step.label}</span>`
                : `<a class="setup-step-label" href="${step.page}">${step.label}</a>`
            }
          </li>`;
        }).join("")}
      </ol>
    </div>
  `;

  containers.forEach((el) => {
    el.innerHTML = html;
    el.querySelector("[data-dismiss-setup-sequence]")?.addEventListener("click", () => {
      setDismissed(true);
      renderSequence(doneFlags);
    });
  });
}

function applyGates(doneFlags) {
  document.querySelectorAll("[data-requires-step]").forEach((el) => {
    const step = Number(el.dataset.requiresStep);
    el.hidden = !doneFlags[step - 1];
  });

  document.querySelectorAll("[data-step-locked-notice]").forEach((el) => {
    const step = Number(el.dataset.stepLockedNotice);
    const isLocked = !doneFlags[step - 1];
    el.hidden = !isLocked;
    if (!isLocked) return;

    const missingIndex = doneFlags.findIndex((d) => !d);
    const missingStep = STEPS[missingIndex] ?? STEPS[STEPS.length - 1];
    const labelEl = el.querySelector("[data-missing-step-label]");
    if (labelEl) labelEl.textContent = missingStep.label;
    const link = el.querySelector("[data-missing-step-link]");
    if (link) {
      link.href = missingStep.page;
      link.textContent = `Go to "${missingStep.label}"`;
    }
  });
}

function update() {
  const doneFlags = computeStepStatus();
  renderSequence(doneFlags);
  applyGates(doneFlags);
}

onConnectionChange(update);
onRegisterChange(update);
