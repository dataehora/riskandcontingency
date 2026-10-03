// Shows a hard-to-miss banner when register-store detects that the
// connected file changed on disk since this tab loaded it (see
// checkConflict() in js/storage/register-store.js). Reloading is the
// only offered resolution — this app is a single-editor-at-a-time tool
// by design (see the About page's FAQ), so there's no merge to attempt,
// only "don't silently overwrite what changed."
//
// Also shows the save-error banner: a write to risk-register.xlsx that
// failed (typically the file is open in Excel, or a sync client such as
// OneDrive has it locked). Without it such a failure was invisible — the
// click simply seemed to do nothing.
import { onRegisterChange, getRegisterState, clearSaveError } from "./storage/register-store.js";
import { t, onLangChange } from "./i18n/i18n.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function insertBanner(attr, html) {
  const main = document.querySelector(".app-main");
  if (!main) return null;
  const banner = document.createElement("div");
  banner.setAttribute(attr, "");
  banner.className = "conflict-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = html;
  main.insertBefore(banner, main.firstChild);
  return banner;
}

function showConflictBanner() {
  if (document.querySelector("[data-conflict-banner]")) return;
  const banner = insertBanner(
    "data-conflict-banner",
    `
    <span aria-hidden="true">&#9888;&#65039;</span>
    <div style="flex:1;">
      <strong>${t("conflict.title")}</strong>
      <p style="margin:4px 0 0;">${t("conflict.body")}</p>
    </div>
    <button type="button" class="btn btn-primary btn-sm" data-conflict-reload style="flex:none;">${t("conflict.reload")}</button>
  `
  );
  banner?.querySelector("[data-conflict-reload]").addEventListener("click", () => location.reload());
}

function showSaveErrorBanner(message) {
  document.querySelector("[data-save-error-banner]")?.remove();
  const banner = insertBanner(
    "data-save-error-banner",
    `
    <span aria-hidden="true">&#9888;&#65039;</span>
    <div style="flex:1;">
      <strong>${t("saveError.title")}</strong>
      <p style="margin:4px 0 0;">${t("saveError.body")}</p>
      <p style="margin:4px 0 0; font-size:0.8rem; opacity:0.8;">${escapeHtml(message)}</p>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" data-save-error-dismiss style="flex:none;">${t("saveError.dismiss")}</button>
  `
  );
  banner?.querySelector("[data-save-error-dismiss]").addEventListener("click", clearSaveError);
}

function sync(state) {
  if (state.conflict) showConflictBanner();
  else document.querySelector("[data-conflict-banner]")?.remove();
  if (state.saveError) {
    const existing = document.querySelector("[data-save-error-banner]");
    if (!existing || existing.dataset.message !== state.saveError) {
      showSaveErrorBanner(state.saveError);
      document.querySelector("[data-save-error-banner]")?.setAttribute("data-message", state.saveError);
    }
  } else {
    document.querySelector("[data-save-error-banner]")?.remove();
  }
}

onRegisterChange(sync);
onLangChange(() => {
  document.querySelector("[data-conflict-banner]")?.remove();
  document.querySelector("[data-save-error-banner]")?.remove();
  sync(getRegisterState());
});
