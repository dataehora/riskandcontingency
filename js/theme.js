// Light/dark theme switch: a labelled two-option control ("Theme: ☀ Light
// | ☾ Dark") in the header, built into [data-theme-switch]. The active
// option is highlighted, so it's clear what the control does and what's
// on. Defaults to the OS preference (handled purely by the
// prefers-color-scheme CSS in tokens.css); once the user picks an
// option, that explicit choice is stored and wins over the OS from then
// on. The theme itself is applied synchronously by the inline snippet in
// each page's <head> (to avoid a flash) — this module only drives the
// switch and keeps it in sync with the OS while no choice was made.
import { t, onLangChange } from "./i18n/i18n.js";

const STORAGE_KEY = "theme-preference";

const ICONS = {
  light: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>`,
  dark: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" fill="currentColor"/></svg>`,
};

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

function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private browsing, etc.) — theme still applies
    // for this page view, it just won't persist.
  }
  document.documentElement.dataset.theme = theme;
  syncSwitch();
}

function syncSwitch() {
  const active = effectiveTheme();
  const following = !getStoredTheme();
  document.querySelectorAll("[data-theme-switch]").forEach((group) => {
    group.querySelectorAll("[data-theme-choice]").forEach((btn) => {
      const on = btn.dataset.themeChoice === active;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    group.title = t(following ? "theme.hintSystem" : "theme.hintChosen", { theme: t(`theme.${active}`) });
  });
}

function buildSwitch() {
  document.querySelectorAll("[data-theme-switch]").forEach((group) => {
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t("theme.caption"));
    group.innerHTML = `
      <span class="switch-caption">${t("theme.caption")}</span>
      ${["light", "dark"]
        .map(
          (theme) => `<button type="button" class="switch-btn" data-theme-choice="${theme}">
            <span class="switch-icon">${ICONS[theme]}</span><span class="switch-label">${t(`theme.${theme}`)}</span>
          </button>`
        )
        .join("")}
    `;
  });
  syncSwitch();
}

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-theme-choice]");
  if (btn) setTheme(btn.dataset.themeChoice);
});

buildSwitch();
onLangChange(buildSwitch);

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!getStoredTheme()) syncSwitch();
});
