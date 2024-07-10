//! scans a breakdown of how many worker threads are still free across the entire network.
import { NS } from "@ns";
import { getServerNames } from "/lib/servers/names";

/**
 * @param {NS} ns
 */
export function calcThreads(ns: NS, minusRam = 0) {
    const servers = getServerNames(ns);

    const ramCost = ns.getScriptRam("hacking/worker.js");

    let total = Math.floor(-minusRam / ramCost);
    let free = Math.floor(-minusRam / ramCost);

    for (const server of servers.filter((server) => ns.hasRootAccess(server))) {
        const maxRam = ns.getServerMaxRam(server);
        const freeRam = maxRam - ns.getServerUsedRam(server);

        total += Math.floor(maxRam / ramCost);
        free += Math.floor(freeRam / ramCost);
    }

    return { total, free };
}

export async function main(ns: NS) {
    const { total, free } = calcThreads(ns);

    ns.tprint(`Free: ${free}. Total in network: ${total}.`);
}
