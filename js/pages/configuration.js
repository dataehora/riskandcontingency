import {
  onRegisterChange,
  applyConfigTemplate,
  rbsList,
  impactAreaList,
  ownerList,
} from "../storage/register-store.js";

const LISTS = { rbs: rbsList, impactAreas: impactAreaList, owners: ownerList };

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function render(state) {
  const emptyState = document.querySelector("[data-config-empty-state]");
  const content = document.querySelector("[data-config-content]");
  const isEmpty =
    state.rbs.length === 0 &&
    state.impactAreas.length === 0 &&
    state.owners.length === 0;
  const ready = state.status === "ready";

  if (emptyState) emptyState.hidden = !ready || !isEmpty;
  if (content) content.hidden = !ready || isEmpty;
  if (!ready) return;

  for (const key of Object.keys(LISTS)) {
    const ul = document.querySelector(`[data-list="${key}"]`);
    if (!ul) continue;
    ul.innerHTML =
      state[key]
        .map(
          (item) => `
        <li class="named-list-item">
          <span>${escapeHtml(item.name)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-remove="${key}" data-id="${item.id}">Remove</button>
        </li>
      `
        )
        .join("") || `<li class="named-list-empty">None yet.</li>`;
  }
}

function wire() {
  document
    .querySelector("[data-load-config-template]")
    ?.addEventListener("click", async () => {
      await applyConfigTemplate();
    });

  document.querySelectorAll("[data-add-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const key = form.dataset.addForm;
      const input = form.querySelector('input[name="name"]');
      const value = input.value.trim();
      if (!value) return;
      await LISTS[key].add(value);
      input.value = "";
      input.focus();
    });
  });

  document.body.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-remove]");
    if (!btn) return;
    await LISTS[btn.dataset.remove].remove(btn.dataset.id);
  });
}

onRegisterChange(render);
wire();
