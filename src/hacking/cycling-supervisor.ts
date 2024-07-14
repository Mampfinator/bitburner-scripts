import { NS, Server } from "@ns";
import { getServers } from "/lib/servers/servers";
import { WorkerPool } from "./workers/pool";
import { WorkerMode } from "./workers/consts";
import { calcThreads } from "/lib/network-threads";
import { HWGWWorkerBatch } from "./workers/batch";

function getPossibleTargetServers(ns: NS) {
    return getServers(ns).filter(
        (server) => server.hasAdminRights && (server.moneyMax ?? 0) > 0,
    );
}

const DELAY = 30000;

export async function main(ns: NS) {
    ns.disableLog("ALL");
    ns.enableLog("exec");

    for (const server of getServers(ns).filter(
        (server) => server.hasAdminRights,
    )) {
        if (server.hostname === "home") continue;
        ns.scp("hacking/worker.js", server.hostname, "home");
    }

    const include = new Set(["netlink"]);

    const pool = new WorkerPool(ns, {
        reserveRam: {
            home: 1024,
        },
    });

    ns.atExit(() => {
        pool.killAll();
    });

    function getPreparationThreads(hostname: string) {
        let growByFactor =
            1 /
            (ns.getServerMoneyAvailable(hostname) /
                ns.getServerMaxMoney(hostname));
        if (growByFactor === Infinity) growByFactor = 20;

        const grow = Math.ceil(ns.growthAnalyze(hostname, growByFactor));

        const growSecIncrease = ns.growthAnalyzeSecurity(grow, hostname);
        const weaken = Math.ceil(
            (ns.getServerSecurityLevel(hostname) -
                ns.getServerMinSecurityLevel(hostname) +
                growSecIncrease) /
                0.05,
        );

        return { grow, weaken };
    }

    /**
     * Prepares a server by maximizing its money and minimizing its security.
     * @returns { Promise<boolean> } whether preparing the server was successful.
     */
    async function prepare(
        hostname: string,
        weakenThreads: number,
        growThreads: number,
    ) {
        const weakenTime = ns.getWeakenTime(hostname);
        const growTime = ns.getGrowTime(hostname);

        const hostLog = `\x1b[1m${hostname}\x1b[0m`;

        ns.print(
            `Preparing ${hostLog} using ${weakenThreads} weaken, ${growThreads} grow threads.`,
        );

        const cleanup = [];
        const promises = [];

        if (weakenThreads > 0) {
            const weakenGroup = pool.reserveGroup(weakenThreads, {});
            if (!weakenGroup) {
                ns.print(
                    `\x1b[31mFailed to reserve weakening workers for ${hostLog}. Aborting.\x1b[0m`,
                );
                return false;
            }
            cleanup.push(() => weakenGroup.kill());
            ns.print(`Starting weakening on ${hostLog}...`);
            await weakenGroup.start(hostname, WorkerMode.Weaken);
            ns.print(`Started weakening on ${hostLog}.`);
            promises.push(weakenGroup.nextDone());
            await ns.asleep(weakenTime - growTime - 3000);
        }

        if (growThreads > 0) {
            const growGroup = pool.reserveGroup(growThreads, {});
            if (!growGroup) {
                ns.print(
                    `\x1b[31mFailed to reserve growing workers for ${hostLog}. Aborting.\x1b[0m`,
                );
                return false;
            }
            cleanup.push(() => growGroup.kill());
            ns.print(`Starting growing on ${hostLog}...`);
            await growGroup.start(hostname, WorkerMode.Grow);
            ns.print(`Started growing on ${hostLog}.`);
            promises.push(growGroup.nextDone());
        }

        await Promise.all(promises);

        for (const cleanupFn of cleanup) cleanupFn();

        const success =
            ns.getServerSecurityLevel(hostname) ===
                ns.getServerMinSecurityLevel(hostname) &&
            ns.getServerMoneyAvailable(hostname) ===
                ns.getServerMaxMoney(hostname);

        return success;
    }

    function isPrepared(server: Server) {
        return (
            (server.moneyAvailable ?? 0) >= (server.moneyMax ?? 0) &&
            (server.hackDifficulty ?? 0) <= (server.minDifficulty ?? 0)
        );
    }

    /**
     * @type { Map<string, Promise<any>> }
     */
    const preparing = new Map();

    /**
     * @type { Map<string, HWGWWorkerBatch[] }
     */
    const workers = new Map();

    /**
     * @type { WeakMap<HWGWWorkerBatch, Promise<any>> }
     */
    const runPromises = new WeakMap();

    while (true) {
        for (const server of getPossibleTargetServers(ns).filter(
            (server) =>
                !preparing.has(server.hostname) &&
                !workers.has(server.hostname) &&
                (!include || include.has(server.hostname)),
        )) {
            if (!isPrepared(server)) {
                const { weaken, grow } = getPreparationThreads(server.hostname);

                preparing.set(
                    server.hostname,
                    prepare(server.hostname, weaken, grow).then(() =>
                        preparing.delete(server.hostname),
                    ),
                );
                continue;
            }

            const cycles = new Array<HWGWWorkerBatch | null>(
                Math.floor(ns.getWeakenTime(server.hostname) / DELAY),
            ).fill(null);
            // until we can figure out how to do this better, we only reserve if we can completely saturate a server. This requires a lot of RAM, but since home has a PB, that's fine.
            const threadsNeeded =
                pool.calculateBatchRatios(server.hostname).total *
                cycles.length;

            if (calcThreads(ns).free < threadsNeeded) continue;

            ns.print(
                `Reserving ${cycles.length} cycles with a total of ${threadsNeeded} threads for ${server.hostname}.`,
            );

            for (let i = 0; i < cycles.length; i++) {
                const batch = pool.reserveBatch(server.hostname, {
                    hackRatio: 0.75,
                });
                if (!batch) {
                    ns.print("ERROR: Failed to start batch.");
                    for (const cycle of cycles) cycle?.kill();
                    break;
                }
                cycles[i] = batch;

                const schedule = async () => {
                    ns.print(`Scheduling batch #${i} for ${server.hostname}.`);

                    const estimatedTime = batch.getDoneTime();
                    const before = Date.now();

                    await batch.run();

                    // should always be >= `estimatedTime`.
                    const actual = Date.now() - before;

                    //if ((actual - estimatedTime) > DELAY) throw new Error(`SHIT'S FUCKED YO ADJUST THINE DELAY`);

                    // adjust how long we sleep for processing delays related to start and nextDone().
                    await ns.asleep(DELAY - (actual - estimatedTime));

                    // I'm, not entirely sure v8's tail call optimizer could figure this out. But we'll see.
                    await schedule();
                };
                if (i === 0) runPromises.set(batch, schedule());
                else
                    runPromises.set(batch, ns.asleep(DELAY * i).then(schedule));
            }

            workers.set(server.hostname, cycles);
        }

        await ns.asleep(20);
    }
}
