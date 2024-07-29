//! Sync server list.
import { NS } from "@ns";
import { auto } from "./proc/auto";
import { getServers } from "/lib/servers/servers";
import { sleep } from "/lib/lib";

export function syncServers(ns: NS) {
    for (const server of getServers(ns)) {
        globalThis.serverCache.update(server);
    }
}

export async function main(ns: NS) {
    auto(ns);
    const flags = ns.flags([["run-once", false]]);

    if (!flags["run-once"]) {
        while (true) {
            syncServers(ns);
            await sleep(5000, true);
        }
    } else {
        syncServers(ns);
    }
}
