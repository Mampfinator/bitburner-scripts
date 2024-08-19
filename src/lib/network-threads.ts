//! scans a breakdown of how many worker threads are still free across the entire network.
import { NS } from "@ns";
import { auto } from "/system/proc/auto";

// TODO: deprecate. This is not the best way to do this.
export function calcThreads(
    threadSize: number,
    reserveRam: Record<string, number> = {},
): { total: number; free: number } {
    return [...servers.values()].reduce(
        (acc, server) => {
            const mem = server.memInfo;
            if (!server.memInfo) return acc;

            const free = acc.free + Math.floor(mem.available / threadSize);
            const total = acc.total + Math.floor(mem.capacity / threadSize);

            return { total, free };
        },
        { total: 0, free: 0 },
    );
}

export async function main(ns: NS) {
    auto(ns);
    const { threadSize } = ns.flags([["threadSize", 2]]) as { threadSize: number };

    const { total, free } = calcThreads(threadSize);

    ns.tprint(`Free: ${free}. Total in network: ${total}.`);
}
