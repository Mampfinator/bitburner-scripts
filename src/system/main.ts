//! Main system script. Does all the syncing and shit required to keep abstractions synced to actual state.
import { NS } from "@ns";
import { syncServers } from "./sync-servers";
import { getServerNames } from "/lib/servers/names";

function listAllProcesses(ns: NS) {
    const processes = [];
    for (const server of getServerNames(ns)) {
        processes.push(...ns.ps(server));
    }

    return processes;
}

export async function main(ns: NS) {
    while (true) {
        // Sync running process list in case any scripts were killed without kill callbacks.
        for (const pid of globalThis.system.proc.running()) {
            if (!ns.isRunning(pid)) {
                globalThis.system.proc.killed(pid);
            }
        }

        const known = new Set(globalThis.system.proc.running());
        for (const process of listAllProcesses(ns)) {
            if (!known.has(process.pid)) {
                globalThis.system.proc.started(process.pid);
            }
        }

        // sync servers in case we *somehow* forget to report having bought/upgraded/nuked anything.
        syncServers(ns);

        await ns.asleep(50);
    }
}
