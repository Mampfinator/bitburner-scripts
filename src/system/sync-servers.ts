//! Sync server list.
import { NS } from "@ns";
import { getServerNames } from "/lib/servers/names";
import { register } from "./memory";
import { auto } from "./proc/auto";

export function syncServers(ns: NS) {
    for (const hostname of getServerNames(ns)) {
        const hasAdminRights = ns.hasRootAccess(hostname);
        const maxRam = ns.getServerMaxRam(hostname);
        register({ hostname, hasAdminRights, maxRam });
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
