export const POOL_MESSAGE_PORT_BASE = 1000;
export const WORKER_MESSAGE_PORT = 10000;

export enum WorkerMode {
    Hack = "hack",
    Grow = "grow",
    Weaken = "weaken",
}

export const WORKER_SCRIPTS = {
    [WorkerMode.Hack]: "hacking/worker-scripts/hack.js",
    [WorkerMode.Grow]: "hacking/worker-scripts/grow.js",
    [WorkerMode.Weaken]: "hacking/worker-scripts/weaken.js",
};
