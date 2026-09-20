// Shows a hard-to-miss banner when register-store detects that the
// connected file changed on disk since this tab loaded it (see
// checkConflict() in js/storage/register-store.js). Reloading is the
// only offered resolution — this app is a single-editor-at-a-time tool
// by design (see the About page's FAQ), so there's no merge to attempt,
// only "don't silently overwrite what changed."
import { onRegisterChange } from "./storage/register-store.js";

function showConflictBanner() {
  if (document.querySelector("[data-conflict-banner]")) return;
  const main = document.querySelector(".app-main");
  if (!main) return;

  const banner = document.createElement("div");
  banner.setAttribute("data-conflict-banner", "");
  banner.className = "conflict-banner";
  banner.innerHTML = `
    <span aria-hidden="true">&#9888;&#65039;</span>
    <div style="flex:1;">
      <strong>This risk register file changed elsewhere.</strong>
      <p style="margin:4px 0 0;">Someone (or another tab) saved a change to it since you loaded it. Your last save here was blocked to avoid overwriting that change. Reload to see the latest version — any unsaved edit on this page will be lost.</p>
    </div>
    <button type="button" class="btn btn-primary btn-sm" data-conflict-reload style="flex:none;">Reload latest</button>
  `;
  main.insertBefore(banner, main.firstChild);
  banner.querySelector("[data-conflict-reload]").addEventListener("click", () => location.reload());
}

function hideConflictBanner() {
  document.querySelector("[data-conflict-banner]")?.remove();
}

onRegisterChange((state) => {
  if (state.conflict) showConflictBanner();
  else hideConflictBanner();
});
