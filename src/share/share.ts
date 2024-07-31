import { NS } from "@ns";
import { run } from "/system/proc/run";
import { reserveThreads } from "/system/memory";

export const WORKER_NAME = "share/share-worker.js";

function getMultiplier(threads: number): number {
    const mult = 1 + Math.log(threads) / 25;
    if (isNaN(mult) || !isFinite(mult)) return 1;
    return mult;
}

function getThreads(multiplier: number): number {
    return Math.exp((multiplier - 1) * 25);
}

export type ShareOptions = { threads: number } | { multiplier: number };
export type KillCallback = () => void;

function spawnThreads(ns: NS, threads: number): number[] | null {
    const workerCost = ns.getScriptRam(WORKER_NAME);

    const pids = [];

    const { reservations } = reserveThreads(threads, workerCost, "share");
    if (!reservations) return null;

    for (const reservation of reservations) {
        const size = globalThis.system.memory.sizeOf(reservation);
        if (!size) continue;
        const threads = Math.floor(size / workerCost);
        const [pid] = run(ns, WORKER_NAME, {
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

export function share(
    ns: NS,
    options: ShareOptions,
): { kill: KillCallback; threads: number; multiplier: number } | null {
    let { threads, multiplier } = options as {
        threads?: number;
        multiplier?: number;
    };
    if (!threads && typeof multiplier === "number" && multiplier <= 1) {
        return null;
    }

    if (!threads) {
        threads = Math.ceil(getThreads(multiplier!));
    }

    if (!multiplier) {
        multiplier = getMultiplier(threads);
    }

    if (threads <= 0 || multiplier <= 1) {
        return null;
    }

    const pids = spawnThreads(ns, threads);
    if (!pids) return null;

    return {
        kill: () => {
            for (const pid of pids) ns.kill(pid);
        },
        threads,
        multiplier,
    };
}
