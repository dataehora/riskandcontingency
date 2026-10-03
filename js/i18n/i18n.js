// Site-wide translation engine (English / Português / Español).
//
// Mechanism, shared by every page (copy lives in the per-language
// dictionaries next to this file, not in the pages):
//   - every static string in the HTML carries a key:
//       data-i18n="key"            -> textContent
//       data-i18n-html="key"       -> innerHTML (dictionary copy only —
//                                     trusted, used for <strong>/<code>)
//       data-i18n-attr="attr:key;attr2:key2" -> attributes
//   - page scripts build dynamic text with t()/tn()/tv() and re-render
//     on onLangChange().
//   - stored data (risk type, record type, status, strategy) stays in
//     English in the workbook — tv() only translates what's displayed.
//
// Adding a string: add the key to en.js, pt.js AND es.js. On localhost a
// console warning lists any key missing from pt/es (see checkDictionaries).
//
// Flags are inline SVG, never emoji: Windows doesn't ship flag emoji, so
// Chrome/Edge there show the letters "US"/"BR"/"ES" instead of a flag.
import en from "./en.js";
import pt from "./pt.js";
import es from "./es.js";

const STORAGE_KEY = "lang-preference";
const DEFAULT_LANG = "en";
const DICTS = { en, pt, es };

const FLAGS = {
  // Simplified at icon size: 13 stripes + canton with a few stars.
  en: `<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#fff"/><g fill="#b22234">${Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 2 * 20) / 13}" width="30" height="${20 / 13}"/>`).join("")}</g><rect width="13" height="${(7 * 20) / 13}" fill="#3c3b6e"/><g fill="#fff">${[
    [2, 2], [5, 2], [8, 2], [11, 2], [3.5, 4.4], [6.5, 4.4], [9.5, 4.4], [2, 6.8], [5, 6.8], [8, 6.8], [11, 6.8], [3.5, 9.2], [6.5, 9.2], [9.5, 9.2],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.7"/>`)
    .join("")}</g></svg>`,
  pt: `<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#009b3a"/><path d="M15 2.2 27.4 10 15 17.8 2.6 10z" fill="#fedf00"/><circle cx="15" cy="10" r="5" fill="#002776"/><path d="M10.2 8.9c3.2-.6 6.6-.1 9.6 1.7l-.3 1c-2.9-1.7-6.1-2.2-9.3-1.6z" fill="#fff"/></svg>`,
  es: `<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/></svg>`,
};

export const LANGS = [
  { code: "en", label: "English", locale: "en-US" },
  { code: "pt", label: "Português", locale: "pt-BR" },
  { code: "es", label: "Español", locale: "es-ES" },
];

function isSupported(code) {
  return LANGS.some((l) => l.code === code);
}

// Saved choice, else the browser's language if we have it, else English.
// Mirrors the inline <head> script in every page (which hides the page
// until the first translation pass, to avoid a flash of English).
function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isSupported(saved)) return saved;
  } catch {
    // storage blocked — fall through
  }
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return isSupported(browser) ? browser : DEFAULT_LANG;
}

let currentLang = initialLang();
const listeners = new Set();

export function getLang() {
  return currentLang;
}

// BCP 47 locale for number/date formatting, following the site language
// (not the browser's) so a page never mixes languages.
export function locale() {
  return LANGS.find((l) => l.code === currentLang)?.locale ?? "en-US";
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export function t(key, vars) {
  const dict = DICTS[currentLang] ?? {};
  let str = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : en[key];
  if (str === undefined) {
    console.warn(`[i18n] missing key "${key}"`);
    return key;
  }
  return interpolate(str, vars);
}

// Plural: looks up "<key>.one" when count === 1, else "<key>.other".
// {count} is available to the string, formatted for the locale.
export function tn(key, count, vars = {}) {
  return t(`${key}.${count === 1 ? "one" : "other"}`, { count: fmtInt(count), ...vars });
}

// Display label for a stored enum value (e.g. tv("status", "Open")).
// Falls back to the value itself — e.g. a user-defined value we have no
// translation for.
export function tv(group, value) {
  if (value == null || value === "") return "";
  const key = `value.${group}.${value}`;
  const dict = DICTS[currentLang] ?? {};
  return dict[key] ?? en[key] ?? String(value);
}

export function fmtInt(n) {
  return Number.isFinite(n) ? n.toLocaleString(locale(), { maximumFractionDigits: 0 }) : "—";
}

export function fmtNum(n, maximumFractionDigits = 0) {
  return Number.isFinite(n) ? n.toLocaleString(locale(), { maximumFractionDigits }) : "—";
}

export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTranslations(root = document) {
  if (root === document) document.documentElement.lang = currentLang;
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s && s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

export function setLang(code) {
  if (!isSupported(code) || code === currentLang) return;
  currentLang = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // non-persistent this session is fine
  }
  applyTranslations();
  syncSwitch();
  for (const listener of listeners) listener(code);
}

// --- Language switch (header, next to the theme toggle) ---------------
function syncSwitch() {
  document.querySelectorAll(".lang-switch-btn").forEach((btn) => {
    const active = btn.dataset.lang === currentLang;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function buildSwitch() {
  const host = document.querySelector(".app-header-actions");
  if (!host || host.querySelector(".lang-switch")) return;
  const group = document.createElement("div");
  group.className = "lang-switch";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Language / Idioma");
  group.innerHTML = LANGS.map(
    (l) =>
      `<button type="button" class="lang-switch-btn" data-lang="${l.code}" title="${l.label}" lang="${l.code}">
        <span class="lang-flag">${FLAGS[l.code]}</span><span class="lang-code">${l.code.toUpperCase()}</span>
      </button>`
  ).join("");
  group.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-lang]");
    if (btn) setLang(btn.dataset.lang);
  });
  const themeToggle = host.querySelector(".theme-toggle");
  host.insertBefore(group, themeToggle ?? null);
  syncSwitch();
}

// Dev aid: list keys present in English but missing in another language.
function checkDictionaries() {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  for (const code of ["pt", "es"]) {
    const missing = Object.keys(en).filter((k) => !(k in DICTS[code]));
    if (missing.length) console.warn(`[i18n] ${code}: ${missing.length} missing key(s)`, missing);
  }
}

applyTranslations();
buildSwitch();
document.documentElement.removeAttribute("data-i18n-pending");
checkDictionaries();
