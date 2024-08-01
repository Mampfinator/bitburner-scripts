//! scans a breakdown of how many worker threads are still free across the entire network.
import { NS } from "@ns";
import { auto } from "/system/proc/auto";

// TODO: deprecate. This is not the best way to do this.
export function calcThreads(
    threadSize: number,
    reserveRam: Record<string, number> = {},
): { total: number; free: number } {
    let total = 0;
    let free = 0;

    for (const server of servers.values()) {
        let { available, capacity } = server.memInfo;
        if (server.hostname in reserveRam) {
            capacity = Math.max(capacity - reserveRam[server.hostname], 0);
            available = Math.max(available - reserveRam[server.hostname], 0);
        }

        total += Math.floor(capacity / threadSize);
        free += Math.floor(available / threadSize);
    }

    if (isNaN(total)) total = Number.MAX_SAFE_INTEGER;
    if (isNaN(free)) free = Number.MAX_SAFE_INTEGER

    return { total, free };
}

export async function main(ns: NS) {
    auto(ns);
    const { threadSize } = ns.flags([["threadSize", 2]]) as { threadSize: number };

    const { total, free } = calcThreads(threadSize);

    ns.tprint(`Free: ${free}. Total in network: ${total}.`);
}
