import { launchJobRunner } from "../../plugins/luna-pool-orchestrator/scripts/job-runner-launch.mjs";

const jobId = process.argv[2];
const runnerScript = process.argv[3];
launchJobRunner({ jobId, runnerScript });
setInterval(() => {}, 1_000);
