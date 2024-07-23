import { NS } from "@ns";
import { run } from "/system/proc/run";

export function autocomplete(data: any, args: any) {
    return [...data.servers];
}

function getMultiplier(threads: number): number {
    const mult = 1 + Math.log(threads) / 25;
    if (isNaN(mult) || !isFinite(mult)) return 1;
    return mult;
}

function getThreads(multiplier: number): number {
    return Math.exp((multiplier - 1) * 25);
}

/**
 * @param {NS} ns
 */
export async function main(ns: NS) {
    const workerCost = ns.getScriptRam("share/share.js");

    function byThreads(threads: number): number[] | null {
        const pids = [];

        const reservations = globalThis.system.memory.reserveTotal(
            threads * workerCost,
        );
        if (!reservations) return null;

        for (const reservation of reservations) {
            const size = globalThis.system.memory.sizeOf(reservation);
            if (!size) continue;
            const threads = Math.floor(size / workerCost);
            const [pid] = run(ns, "share/share.js", {
                threads,
                temporary: true,
                useReservation: reservation,
            });
            if (pid <= 0) {
                for (const pid of pids) ns.kill(pid);
                return null;
            }

            pids.push(pid);
        }

        return pids;
    }

    function byMultiplier(targetMult: number): number[] | null {
        const threads = getThreads(targetMult);
        return byThreads(threads);
    }

    const { threads, multiplier } = ns.flags([
        ["threads", 0],
        ["multiplier", 0],
    ]) as { threads: number; multiplier: number };

    if (threads > 0 && multiplier > 0) {
        ns.tprint("ERROR: only specify one of threads or multiplier.");
        return;
    }

    const pids: number[] = [];
    if (threads > 0) {
        const started = byThreads(threads);
        if (!started)
            return ns.tprint(
                `ERROR: failed to reserve ${threads} sharing threads.`,
            );
        pids.push(...started);
    } else if (multiplier > 0) {
        if (multiplier <= 1)
            return ns.tprint(`ERROR: multiplier needs to be >= 1.`);
        const started = byMultiplier(multiplier);
        if (!started)
            return ns.tprint(
                `ERROR: failed to reserve enough threads for a share multiplier of ${multiplier} (${getThreads(multiplier)}t)`,
            );
        pids.push(...started);
    }

    ns.atExit(() => {
        for (const pid of pids) {
            ns.kill(pid);
        }
    });

    while (true) {
        await ns.sleep(1000);
    }
}
