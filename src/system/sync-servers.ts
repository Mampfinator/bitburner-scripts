//! Sync server list.
import { NS } from "@ns";
import { register } from "./memory";
import { auto } from "./proc/auto";
import { getServers } from "/lib/servers/servers";

export function syncServers(ns: NS) {
    for (const server of getServers(ns)) {
        register(server);
    }
}

export async function main(ns: NS) {
    auto(ns);
    const flags = ns.flags([["run-once", false]]);

    if (!flags["run-once"]) {
        while (true) {
            syncServers(ns);
            await ns.asleep(5000);
        }
    } else {
        syncServers(ns);
    }
}
