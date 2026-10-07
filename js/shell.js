import {
  isFileSystemAccessSupported,
  getConnectionState,
  onConnectionChange,
  restoreConnection,
  connectFolder,
  reconnectFolder,
  disconnectFolder,
} from "./storage/folder-connection.js";
import { t, onLangChange } from "./i18n/i18n.js";

function highlightActiveNav() {
  const page = document.body.dataset.page;
  if (!page) return;
  document.querySelectorAll(".app-nav a[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function wireMobileNavToggle() {
  const toggle = document.querySelector(".app-nav-toggle");
  const nav = document.querySelector(".app-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const STATUS_KEYS = ["checking", "unsupported", "disconnected", "reconnect", "connected", "error"];

function renderConnectionUi(state) {
  const pill = document.querySelector("[data-connection-pill]");
  const label = document.querySelector("[data-connection-label]");
  const primaryBtns = document.querySelectorAll("[data-connection-action]");
  const disconnectBtns = document.querySelectorAll(
    "[data-connection-disconnect]"
  );

  if (pill) pill.dataset.state = state.status;
  if (label) {
    const text =
      state.status === "connected" && state.folderName
        ? t("connection.connectedTo", { folder: state.folderName })
        : STATUS_KEYS.includes(state.status)
          ? t(`connection.${state.status}`)
          : state.status;
    label.textContent = text;
    pill?.setAttribute("aria-label", text);
  }

  primaryBtns.forEach((primaryBtn) => {
    if (state.status === "connected") {
      primaryBtn.textContent = t("connection.changeFolder");
      primaryBtn.hidden = false;
    } else if (state.status === "reconnect") {
      primaryBtn.textContent = t("connection.reconnect");
      primaryBtn.hidden = false;
    } else if (state.status === "unsupported") {
      primaryBtn.hidden = true;
    } else {
      primaryBtn.textContent = t("connection.connectFolder");
      primaryBtn.hidden = false;
    }
  });

  disconnectBtns.forEach((disconnectBtn) => {
    disconnectBtn.hidden = state.status !== "connected";
  });

  document
    .querySelectorAll("[data-requires-connection]")
    .forEach((el) => {
      el.hidden = state.status !== "connected";
    });
  document
    .querySelectorAll("[data-requires-no-connection]")
    .forEach((el) => {
      el.hidden = state.status === "connected";
    });
}

// Project bar (2026-10-07): a strip right under the tabs naming the
// connected folder — the folder *is* the project (one workbook per
// folder) — so it's always clear which register a page is working on.
// Only on the working pages; Home, About and Contact don't get one.
const PROJECT_BAR_PAGES = ["risk-register", "modelling", "contingency", "reporting", "configuration"];

function ensureProjectBar() {
  if (!PROJECT_BAR_PAGES.includes(document.body.dataset.page)) return null;
  let bar = document.querySelector("[data-project-bar]");
  if (bar) return bar;
  const header = document.querySelector(".app-header");
  if (!header) return null;
  bar = document.createElement("div");
  bar.className = "project-bar";
  bar.setAttribute("data-project-bar", "");
  bar.setAttribute("role", "status");
  bar.innerHTML = `<div class="project-bar-inner"><span class="project-bar-label"></span> <strong class="project-bar-name"></strong> <span class="project-bar-note"></span></div>`;
  header.after(bar);
  return bar;
}

function renderProjectBar(state) {
  const bar = ensureProjectBar();
  if (!bar) return;
  const hasFolder = (state.status === "connected" || state.status === "reconnect") && state.folderName;
  bar.dataset.state = hasFolder ? state.status : "none";
  bar.querySelector(".project-bar-label").textContent = t("project.label");
  bar.querySelector(".project-bar-name").textContent = hasFolder
    ? `“${state.folderName}”`
    : t("project.none");
  bar.querySelector(".project-bar-note").textContent =
    state.status === "reconnect" ? t("project.reconnectNote") : "";
}

function wireConnectionControls() {
  document.querySelectorAll("[data-connection-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const state = getConnectionState();
      if (state.status === "reconnect") {
        await reconnectFolder();
      } else {
        await connectFolder();
      }
    });
  });

  document.querySelectorAll("[data-connection-disconnect]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await disconnectFolder();
    });
  });

  if (!isFileSystemAccessSupported()) {
    document
      .querySelectorAll("[data-unsupported-notice]")
      .forEach((el) => (el.hidden = false));
  }

  onConnectionChange((state) => {
    renderConnectionUi(state);
    renderProjectBar(state);
  });
  onLangChange(() => {
    renderConnectionUi(getConnectionState());
    renderProjectBar(getConnectionState());
  });
  restoreConnection();
}

highlightActiveNav();
wireMobileNavToggle();
wireConnectionControls();
