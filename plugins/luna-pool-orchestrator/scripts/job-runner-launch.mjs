import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_SCRIPT = path.join(SCRIPT_DIRECTORY, "job-runner.mjs");
const WINDOWS_LAUNCHER = path.join(SCRIPT_DIRECTORY, "job-runner-launcher.vbs");

export function launchJobRunner({
  jobId,
  platform = process.platform,
  env = process.env,
  nodeExecutable = process.execPath,
  runnerScript = RUNNER_SCRIPT,
  spawnImpl = spawn,
  onError = () => {},
} = {}) {
  const windows = platform === "win32";
  const command = windows
    ? path.join(env.SystemRoot ?? env.WINDIR ?? "C:\\Windows", "System32", "wscript.exe")
    : nodeExecutable;
  const args = windows
    ? [WINDOWS_LAUNCHER, nodeExecutable, runnerScript, jobId]
    : [runnerScript, jobId];
  const child = spawnImpl(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
  });
  const ready = new Promise((resolve, reject) => {
    const fail = (error) => { onError(error); reject(error); };
    if (child.once) {
      child.once("spawn", resolve);
      child.once("error", fail);
    } else {
      child.on?.("error", fail);
      resolve();
    }
  });
  child.unref?.();
  return { launched: true, bridgePid: child.pid ?? null, mode: windows ? "wsh-detached" : "detached", ready };
}
