// Renders the 4-step setup sequence into any [data-setup-sequence]
// container, and gates page content behind [data-requires-step="N"] /
// [data-step-locked-notice="N"] (N is 1-4, matching STEPS below) so a
// step's UI never appears before its prerequisites are met.
import { getConnectionState, onConnectionChange } from "./storage/folder-connection.js";
import { getRegisterState, onRegisterChange } from "./storage/register-store.js";

export const STEPS = [
  { key: "folder", label: "Select folder", page: "/index.html" },
  { key: "config", label: "Create config file", page: "/configuration.html" },
  { key: "risk-record", label: "Create risk record", page: "/risk-register.html" },
  { key: "modelling", label: "Run modelling", page: "/modelling.html" },
];

export function computeStepStatus() {
  const connection = getConnectionState();
  const register = getRegisterState();

  const folderDone = connection.status === "connected";
  const configDone =
    folderDone &&
    register.status === "ready" &&
    (register.rbs.length > 0 ||
      register.impactAreas.length > 0 ||
      register.owners.length > 0);
  const riskRecordDone = configDone && register.riskRecords.length > 0;
  const modellingDone = riskRecordDone && !!register.settings?.lastModelledAt;

  return [folderDone, configDone, riskRecordDone, modellingDone];
}

function renderSequence(doneFlags) {
  const containers = document.querySelectorAll("[data-setup-sequence]");
  if (!containers.length) return;

  const firstNotDone = doneFlags.findIndex((d) => !d);

  const html = `
    <div class="setup-sequence">
      <span class="eyebrow">Setup sequence</span>
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
