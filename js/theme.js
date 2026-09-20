// Dark/light toggle. Defaults to the OS preference (handled purely by
// the prefers-color-scheme CSS in tokens.css); once the user flips the
// switch, that explicit choice is stored and wins over the OS from then
// on. The actual theme is applied synchronously by the inline snippet
// in each page's <head> (to avoid a flash) — this module only wires the
// visible switch and keeps it in sync with the OS if no choice was made.
const STORAGE_KEY = "theme-preference";

function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function effectiveTheme() {
  return getStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

function applyTheme(theme) {
  if (theme) {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private browsing, etc.) — theme still applies
    // for this page view, it just won't persist.
  }
  applyTheme(theme);
  syncToggle();
}

function syncToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) toggle.checked = effectiveTheme() === "dark";
}

function wireToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;
  toggle.addEventListener("change", () => {
    setTheme(toggle.checked ? "dark" : "light");
  });
  syncToggle();
}

wireToggle();

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (!getStoredTheme()) syncToggle();
  });
