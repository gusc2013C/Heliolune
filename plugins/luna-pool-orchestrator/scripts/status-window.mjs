import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MCP_APP_EXTENSION_ID = "io.modelcontextprotocol/ui";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const WINDOW_SCRIPT = path.join(SCRIPT_DIRECTORY, "status-window.ps1");
const WINDOW_LAUNCHER = path.join(SCRIPT_DIRECTORY, "status-window-launcher.vbs");

export function detectSystemLanguage({
  platform = process.platform,
  env = process.env,
  execFileSyncImpl = execFileSync,
  fallbackLocale = Intl.DateTimeFormat().resolvedOptions().locale,
} = {}) {
  let locale = env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? fallbackLocale ?? "en";
  if (platform === "win32") {
    try {
      const windowsRoot = env.SystemRoot ?? env.WINDIR ?? "C:\\Windows";
      const registry = execFileSyncImpl(path.join(windowsRoot, "System32", "reg.exe"), [
        "query", "HKCU\\Control Panel\\International", "/v", "LocaleName",
      ], { encoding: "utf8", windowsHide: true });
      locale = registry.match(/LocaleName\s+REG_SZ\s+([^\s]+)/i)?.[1] ?? locale;
    } catch { /* retain the runtime locale */ }
  }
  return String(locale).toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function supportsInlineStatus(capabilities) {
  const ui = capabilities?.extensions?.[MCP_APP_EXTENSION_ID];
  return Array.isArray(ui?.mimeTypes) && ui.mimeTypes.includes(MCP_APP_MIME_TYPE);
}

export function shouldLaunchStatusWindow({
  mode = process.env.HELIOLUNE_STATUS_WINDOW ?? "auto",
  platform = process.platform,
  progressEnabled = false,
  inlineUiSupported = false,
} = {}) {
  const normalized = String(mode).trim().toLowerCase();
  if (normalized === "off" || normalized === "false" || normalized === "0") return false;
  if (platform !== "win32") return false;
  if (normalized === "on" || normalized === "true" || normalized === "1") return true;
  return !progressEnabled && !inlineUiSupported;
}

export function launchStatusWindow({ jobId, jobRoot, spawnImpl = spawn, ...decision } = {}) {
  if (!shouldLaunchStatusWindow(decision)) return { launched: false, reason: "host-status-supported-or-disabled" };
  const args = [WINDOW_LAUNCHER, WINDOW_SCRIPT, jobId, jobRoot ?? ""];
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  const launcherExecutable = path.join(windowsRoot, "System32", "wscript.exe");
  const child = spawnImpl(launcherExecutable, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on?.("error", () => {});
  child.unref?.();
  return { launched: true, pid: child.pid ?? null, reason: "native-fallback" };
}
