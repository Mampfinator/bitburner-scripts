//! Main system script. Does all the syncing and shit required to keep abstractions synced to actual state.
//! Also runs some core functionality.
import { NS } from "@ns";
import { syncServers } from "./sync-servers";
import { getServerNames } from "/lib/servers/names";
import { auto } from "./proc/auto";
import { sleep } from "/lib/lib";
import { ServerProvider } from "/lib/servers/server-provider";
import { load } from "./load";

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

declare global {
    function awaitSystemReady(ns: NS): Promise<void>;
}

let ready = false;

export async function main(ns: NS) {
    ready = false;
    globalThis.awaitSystemReady = async (otherNs: NS) => {
        while (!ready) {
            await otherNs.asleep(250);
        }
    };

    await load(ns);

    globalThis.eventEmitter.register(ns, "server:added", (hostname: string) => {
        ns.scp(
            [
                // call scripts
                "call/call.js",
                "call/call-worker.js",

                // hacking workers
                "hacking/worker-scripts/grow.js",
                "hacking/worker-scripts/hack.js",
                "hacking/worker-scripts/weaken.js",

                // share worker
                "share/share.js",
            ],
            hostname,
            "home",
        );
    });

    const skip = new Set<string>();

    const provider = new ServerProvider(ns);
    globalThis.servers.setBridge(provider.bridge);

    // for good measure
    syncServers(ns);

    auto(ns, { tag: "system" });

    while (true) {
        syncProcesses(ns);
        for (const serverName of getServerNames(ns)) {
            const server = servers.get(serverName);
            if (!server) {
                console.error(`Expected server ${serverName} to exist, but it doesn't.`, servers);
                continue;
            }

            // we skip down here because `ServerCache#get` further up automatically updates the server,
            // and doing that periodically can't hurt.
            if (skip.has(server.hostname)) {
                continue;
            }

            const processed = server.root() && (await server.backdoor());
            if (processed) {
                skip.add(server.hostname);
            }
        }

        ready = true;

        await sleep(50, true);
    }
}
