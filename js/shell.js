import {
  isFileSystemAccessSupported,
  getConnectionState,
  onConnectionChange,
  restoreConnection,
  connectFolder,
  reconnectFolder,
  disconnectFolder,
} from "./storage/folder-connection.js";

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

const STATUS_LABEL = {
  checking: "Checking…",
  unsupported: "Folder access unsupported",
  disconnected: "Not connected",
  reconnect: "Reconnect folder",
  connected: "Connected",
  error: "Connection error",
};

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
        ? `Connected to Folder: ${state.folderName}`
        : STATUS_LABEL[state.status] ?? state.status;
    label.textContent = text;
    pill?.setAttribute("aria-label", text);
  }

  primaryBtns.forEach((primaryBtn) => {
    if (state.status === "connected") {
      primaryBtn.textContent = "Change folder";
      primaryBtn.hidden = false;
    } else if (state.status === "reconnect") {
      primaryBtn.textContent = "Reconnect folder";
      primaryBtn.hidden = false;
    } else if (state.status === "unsupported") {
      primaryBtn.hidden = true;
    } else {
      primaryBtn.textContent = "Connect folder";
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

  onConnectionChange(renderConnectionUi);
  restoreConnection();
}

highlightActiveNav();
wireMobileNavToggle();
wireConnectionControls();
