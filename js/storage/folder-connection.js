// Connects the app to a "standard folder" on the user's machine using the
// File System Access API, and remembers the chosen folder (its handle)
// across sessions via IndexedDB. Chromium-only (Chrome/Edge/Opera) by
// design — see CLAUDE.md for the browser-support trade-off this accepts.
import { idbGet, idbSet, idbDelete } from "./idb-kv.js";

const HANDLE_KEY = "risk-register-folder-handle";

export const isFileSystemAccessSupported = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

const listeners = new Set();

let state = {
  status: isFileSystemAccessSupported() ? "checking" : "unsupported",
  folderName: null,
};

function setState(next) {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

export function getConnectionState() {
  return state;
}

export function onConnectionChange(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getDirectoryHandle() {
  return state.status === "connected" ? state.handle ?? null : null;
}

async function verifyPermission(handle, requestIfNeeded) {
  const opts = { mode: "readwrite" };
  const current = await handle.queryPermission(opts);
  if (current === "granted") return true;
  if (!requestIfNeeded) return false;
  const requested = await handle.requestPermission(opts);
  return requested === "granted";
}

// Attempts to silently resume the previously chosen folder. Cannot grant
// permission without a user gesture, so this can land in "reconnect"
// (folder known, but the browser needs a click before it'll allow access).
export async function restoreConnection() {
  if (!isFileSystemAccessSupported()) {
    setState({ status: "unsupported", folderName: null });
    return;
  }

  const handle = await idbGet(HANDLE_KEY);
  if (!handle) {
    setState({ status: "disconnected", folderName: null, handle: null });
    return;
  }

  try {
    const granted = await verifyPermission(handle, false);
    if (granted) {
      setState({ status: "connected", folderName: handle.name, handle });
    } else {
      setState({ status: "reconnect", folderName: handle.name, handle });
    }
  } catch (err) {
    setState({ status: "disconnected", folderName: null, handle: null });
  }
}

// Must be called from a user gesture (click handler) — the browser requires
// this for both showDirectoryPicker and requestPermission.
export async function connectFolder() {
  if (!isFileSystemAccessSupported()) {
    setState({ status: "unsupported", folderName: null });
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "risk-register-folder",
      mode: "readwrite",
      startIn: "documents",
    });
    const granted = await verifyPermission(handle, true);
    if (!granted) {
      setState({ status: "disconnected", folderName: null, handle: null });
      return;
    }
    await idbSet(HANDLE_KEY, handle);
    setState({ status: "connected", folderName: handle.name, handle });
  } catch (err) {
    // AbortError = user dismissed the picker; leave state as-is.
    if (err?.name !== "AbortError") {
      setState({ status: "error", folderName: null, handle: null });
    }
  }
}

// Re-grants permission on an already-known folder (no picker shown), for
// the "reconnect" state on a fresh browser session.
export async function reconnectFolder() {
  if (state.status !== "reconnect" || !state.handle) return;
  try {
    const granted = await verifyPermission(state.handle, true);
    if (granted) {
      setState({ status: "connected", folderName: state.handle.name });
    }
  } catch (err) {
    setState({ status: "error", folderName: null, handle: null });
  }
}

export async function disconnectFolder() {
  await idbDelete(HANDLE_KEY);
  setState({ status: "disconnected", folderName: null, handle: null });
}
