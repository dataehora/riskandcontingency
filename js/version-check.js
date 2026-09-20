// Detects when a newer deployment has shipped while this tab has been
// open, and shows a persistent (not silently dismissible-forever) banner
// prompting a refresh — rather than force-reloading, which could discard
// an in-progress Risk Register form edit that hasn't been saved yet.
//
// This is a *belt* on top of the *braces*: the real fix for "stale
// browser cache" is the `_headers` file (Cache-Control: no-cache on
// every response), which makes every fresh page load/hard refresh pull
// current content regardless of this script. This module only covers
// the case of a tab left open across a deploy.
const CHECK_INTERVAL_MS = 30_000;
let loadedVersion = null;

async function fetchVersion() {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version;
  } catch {
    return null;
  }
}

function showUpdateBanner() {
  if (document.querySelector("[data-update-banner]")) return;
  const banner = document.createElement("div");
  banner.setAttribute("data-update-banner", "");
  banner.className = "update-banner";
  banner.innerHTML = `
    <span>A new version of this app is available.</span>
    <button type="button" class="btn btn-accent btn-sm" data-update-reload>Refresh now</button>
    <button type="button" class="btn btn-ghost btn-sm" data-update-dismiss aria-label="Dismiss for now">&times;</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector("[data-update-reload]").addEventListener("click", () => location.reload());
  banner.querySelector("[data-update-dismiss]").addEventListener("click", () => banner.remove());
}

async function checkForUpdate() {
  const latest = await fetchVersion();
  if (latest && loadedVersion && latest !== loadedVersion) {
    showUpdateBanner();
  }
}

async function init() {
  loadedVersion = await fetchVersion();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
}

init();
