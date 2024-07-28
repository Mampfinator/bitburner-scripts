//! Main system script. Does all the syncing and shit required to keep abstractions synced to actual state.
//! Also runs some core functionality.
import { NS } from "@ns";
import { syncServers } from "./sync-servers";
import { getServerNames } from "/lib/servers/names";
import { auto } from "./proc/auto";
import { getServerGraph } from "/lib/servers/graph";
import { processServer } from "./servers";
import { register } from "./memory";

function listAllProcesses(ns: NS) {
    const processes = [];
    for (const server of getServerNames(ns)) {
        processes.push(...ns.ps(server));
    }

    return processes;
}

function syncProcesses(ns: NS) {
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
}

export async function main(ns: NS) {
    auto(ns, { tag: "system" });

    const skip = new Set<string>();

    // for good measure
    syncServers(ns);

    while (true) {
        syncProcesses(ns);

        const graph = getServerGraph(ns);

        for (const server of [...graph.nodes].map((server) => ns.getServer(server))) {
            const processed = await processServer(server, ns, graph);

            if (!processed) continue;

            graph.addEdge("home", server.hostname);

            // update memory information
            register(server);
            skip.add(server.hostname);
        }

        await ns.asleep(50);
    }
}
