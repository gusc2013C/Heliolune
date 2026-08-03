import { writeFile } from "node:fs/promises";
import path from "node:path";

const jobId = process.argv[2];
const root = process.env.HELIOLUNE_DETACH_PROBE_ROOT;
if (!jobId || !root) throw new Error("Detached runner probe requires a job id and HELIOLUNE_DETACH_PROBE_ROOT.");
await writeFile(path.join(root, `${jobId}.pid`), String(process.pid), "utf8");
setInterval(() => {}, 1_000);
