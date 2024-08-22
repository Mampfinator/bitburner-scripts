import { BasicHGWOptions, NS } from "@ns";

export const WORKER_MESSAGE_PORT_BASE = 10000;

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
}

export interface WorkerAbortMessage {
    event: "abort";
}

export type WorkerMessage = WorkerStartMessage | WorkerStopMessage | WorkerAbortMessage;
