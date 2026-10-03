// Inline "name this" field, used instead of window.prompt() when saving
// a Risk Register baseline or a modelling: a small form rendered into
// `container` (label, prefilled text field, Save / Cancel). Resolves with
// the trimmed name (the suggestion when left blank), or null on Cancel /
// Escape. The container is emptied and hidden again afterwards.
import { t } from "./i18n/i18n.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function askName(container, { label, value = "" }) {
  return new Promise((resolve) => {
    if (!container) return resolve(null);
    const id = `inline-name-${Math.random().toString(36).slice(2, 8)}`;
    container.innerHTML = `
      <form class="inline-name-form">
        <label for="${id}">${escapeHtml(label)}</label>
        <div class="inline-name-row">
          <input id="${id}" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(value)}">
          <button class="btn btn-primary btn-sm" type="submit">${t("common.save")}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-inline-cancel>${t("common.cancel")}</button>
        </div>
      </form>
    `;
    container.hidden = false;
    const form = container.querySelector("form");
    const input = container.querySelector("input");
    input.focus();
    input.select();

    const finish = (result) => {
      container.innerHTML = "";
      container.hidden = true;
      resolve(result);
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(input.value.trim() || value);
    });
    container.querySelector("[data-inline-cancel]").addEventListener("click", () => finish(null));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(null);
    });
  });
}
