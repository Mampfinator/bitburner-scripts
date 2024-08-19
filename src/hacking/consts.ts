import { BasicHGWOptions, NS } from "@ns";

export const POOL_MESSAGE_PORT_BASE = 1000;
export const WORKER_MESSAGE_PORT = 10000;

export enum WorkerMode {
    Hack = "hack",
    Grow = "grow",
    Weaken = "weaken",
}

export function getWorkerScriptCost(ns: NS, mode: WorkerMode) {
    return 1.6 + ns.getFunctionRamCost(mode);
}

export const WORKER_SCRIPT_PATH = "hacking/worker.js";

export interface WorkerStartMessage {
    event: "start";
    data: {
        options?: BasicHGWOptions;
    };
}

export interface WorkerStopMessage {
    event: "stop";
    data: {};
}

export type WorkerMessage = WorkerStartMessage | WorkerStopMessage;
