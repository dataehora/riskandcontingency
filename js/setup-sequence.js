// Renders the 4-step setup sequence into any [data-setup-sequence]
// container (Home page only, by design) and gates page content on every
// page behind [data-requires-step="N"] / [data-step-locked-notice="N"]
// (N is 1-4, matching STEPS below) so a step's UI never appears before
// its prerequisites are met.
import { getConnectionState, onConnectionChange } from "./storage/folder-connection.js";
import { getRegisterState, onRegisterChange } from "./storage/register-store.js";
import { t, onLangChange } from "./i18n/i18n.js";

export const STEPS = [
  { key: "folder", page: "/index.html" },
  { key: "config", page: "/configuration.html" },
  { key: "riskRecord", page: "/risk-register.html" },
  { key: "modelling", page: "/modelling.html" },
];

function stepLabel(step) {
  return t(`setup.step.${step.key}`);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

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
        <span class="eyebrow">${t("setup.title")}</span>
        ${allDone ? `<button type="button" class="btn btn-ghost btn-sm" data-dismiss-setup-sequence aria-label="${t("setup.dismissAria")}">${t("setup.dismiss")} &times;</button>` : ""}
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
                ? `<span class="setup-step-label">${stepLabel(step)}</span>`
                : `<a class="setup-step-label" href="${step.page}">${stepLabel(step)}</a>`
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
    // "You need to finish <step> before <purpose>. Go to "<step>" →"
    const message = el.querySelector("[data-locked-purpose]");
    if (message) {
      const label = stepLabel(missingStep);
      message.innerHTML = `${t("setup.locked", {
        step: `<strong>${escapeHtml(label)}</strong>`,
        purpose: escapeHtml(t(message.dataset.lockedPurpose)),
      })} <a href="${missingStep.page}">${escapeHtml(t("setup.goTo", { step: label }))}</a>`;
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
onLangChange(update);
