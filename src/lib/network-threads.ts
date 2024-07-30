//! scans a breakdown of how many worker threads are still free across the entire network.
import { NS } from "@ns";
import { auto } from "/system/proc/auto";

export function calcThreads(minusRam = 0) {
    // Most expensive worker script.
    const ramCost = 1.75;

    let total = Math.floor(-minusRam / ramCost);
    let free = Math.floor(-minusRam / ramCost);

    for (const server of servers.values()) {
        const { maxRam, freeRam } = server;

        total += Math.floor(maxRam / ramCost);
        free += Math.floor(freeRam / ramCost);
    }

    return { total, free };
}

export async function main(ns: NS) {
    auto(ns);
    const { total, free } = calcThreads();

    ns.tprint(`Free: ${free}. Total in network: ${total}.`);
}
