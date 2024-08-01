import { NS, Server } from "@ns";
import { WORKER_SCRIPTS, WorkerMode } from "./consts";
import { type WorkerGroup } from "./workers/group";
import { WorkerPool } from "./pool";
import { MONITORING_PORT } from "monitoring/monitor.js";
import { calcThreads } from "/lib/network-threads";
import { auto } from "/system/proc/auto";

export interface SupervisorSettings {
    limitServers?: number;
    reserveHomeRam?: number;
    hackRatio?: number;
    exclude?: string[];
}

// TODO: rewrite
export async function main(ns: NS) {
    auto(ns, { tag: "hacking" });
    const startedAt = Math.floor(Date.now() / 1000);
    const settingsText = ns.read("hacking/supervisor-settings.json");
    const settings: SupervisorSettings = JSON.parse(settingsText.length > 0 ? settingsText : "{}");

    const exclude = new Set(settings.exclude ?? []);

    ns.disableLog("ALL");

    function copyFiles(server: string) {
        for (const script of Object.values(WORKER_SCRIPTS)) {
            ns.scp(script, server);
        }
    }

    for (const server of globalThis.servers.values()) {
        if (server.hostname === "home") continue;
        copyFiles(server.hostname);
    }

    globalThis.eventEmitter.register(ns, "server:added", ({ hostname }: { hostname: string }) => {
        copyFiles(hostname);
    });

    const prepared = new Set();

    /**
     * @type { Map<string, Promise<boolean> }
     */
    const promises = new Map();

    let profit = 0;

    const pool = new WorkerPool(ns, {
        reserveRam: {
            home: settings.reserveHomeRam ?? 1024,
        },
    });

    function approximateOptimalHackRatio(
        hostname: string,
        maxThreads: number,
        maxRatio = 0.95,
        minRatio = 0.1,
        iterations = 10,
    ) {
        if (typeof hostname !== "string") throw new TypeError(`Invalid hostname: ${hostname}`);
        if (typeof maxThreads !== "number") throw new TypeError(`Invalid maxThreads: ${maxThreads}`);
        if (typeof iterations !== "number") throw new TypeError(`Invalid iterations: ${iterations}`);

        if (pool.calculateBatchRatios(hostname, maxRatio).total <= maxThreads) return maxRatio;

        let ratio = 0.5;

        while (iterations-- > 0) {
            const threads = pool.calculateBatchRatios(hostname, ratio).total;

            // Should only ever be true if the server is currently completely drained of money.
            if (threads === 0) {
                return 0;
            }

            // this will almost certainly never be true but I guess it can't hurt to return early here
            if (threads === maxThreads) {
                return ratio;
            }

            if (threads > maxThreads) {
                ratio -= ratio / 2;
            } else {
                ratio += (1 - ratio) / 2;
            }
        }

        

        return Math.min(Math.max(ratio, minRatio), maxRatio);
    }

    /**
     * @param {Server} server
     * @returns {number}
     */
    function rateServer(server: Server, freeThreads: number) {
        const hackRatio = approximateOptimalHackRatio(server.hostname, freeThreads);
        const requiredThreads = pool.calculateBatchRatios(server.hostname, hackRatio).total;

        // If requiredThreads is 0, the formula below would become 0.
        // Return 0 instead; we're not interested in this server for now.
        if (requiredThreads === 0) return 0;

        return (((server.moneyMax ?? 0) / (server.minDifficulty ?? 100)) * hackRatio) / requiredThreads;
    }

    ns.print("Initialized pool.");

    ns.atExit(() => {
        pool.killAll();
    });

    function getPreparationThreads(hostname: string, availableThreads: number) {
        const server = globalThis.servers.get(hostname)!;

        let growByFactor = 1 / (server.moneyAvailable / server.moneyMax);
        if (growByFactor === Infinity) growByFactor = 20;

        let growThreads = Math.ceil(ns.growthAnalyze(hostname, growByFactor));

        const growSecIncrease = ns.growthAnalyzeSecurity(growThreads, hostname);
        let weakenThreads = Math.ceil((server.hackDifficulty - server.minDifficulty + growSecIncrease) / 0.05);

        const total = growThreads + weakenThreads;

        if (availableThreads && availableThreads > 0 && total > availableThreads) {
            growThreads = Math.ceil(growThreads * (availableThreads / total));
            weakenThreads = Math.floor(weakenThreads * (availableThreads / total));

            if (growThreads + weakenThreads > availableThreads) growThreads -= 1;
        }

        return { growThreads, weakenThreads };
    }

    /**
     * Prepares a server by maximizing its money and minimizing its security.
     * @param {string} hostname
     * @returns { Promise<boolean> } whether preparing the server was successful.
     */
    async function prepare(
        hostname: string,
        weakenGroup: WorkerGroup | undefined,
        growGroup: WorkerGroup | undefined,
    ): Promise<boolean> {
        const weakenTime = ns.getWeakenTime(hostname);
        const growTime = ns.getGrowTime(hostname);

        const hostLog = `\x1b[1m${hostname}\x1b[0m`;

        const donePromises = [];

        if (!!weakenGroup) {
            ns.print(`Starting weakening on ${hostLog}.`);
            weakenGroup.work();
            donePromises.push(weakenGroup.nextDone());
            await ns.asleep(weakenTime - growTime - 3000);
        }

        if (!!growGroup) {
            ns.print(`Starting growing on ${hostLog}.`);
            growGroup.work();
            donePromises.push(growGroup.nextDone());
        }

        await Promise.all(donePromises);

        const server = globalThis.servers.get(hostname)!;

        const success = server.hackDifficulty === server.minDifficulty && server.moneyAvailable === server.moneyMax;

        if (success) {
            ns.print(`INFO: ${hostLog} has been prepared for hacking.`);
            if (!prepared.has(hostname)) {
                prepared.add(hostname);
            }
        } else {
            ns.print(`WARNING: Server ${hostLog} could not be prepared for HWGW cycling.`);
        }

        return success;
    }

    /**
     * @param { Server } server
     */
    function isPrepared(server: Server) {
        return (
            (server.moneyAvailable ?? 0) >= (server.moneyMax ?? 0) &&
            (server.minDifficulty ?? 0) >= (server.hackDifficulty ?? 0)
        );
    }

    function markIdle(server: Server) {
        ns.writePort(MONITORING_PORT, {
            event: "setStatus",
            data: { status: "idle", target: server.hostname },
        });
    }

    while (true) {
        ns.setTitle(
            `Supervising ${promises.size} cycles | +\$${ns.formatNumber(profit / (Date.now() / 1000 - startedAt))}/sec (\$${ns.formatNumber(profit)})`,
        );

        let { free: freeWorkerThreads } = calcThreads(2, pool.options?.reserveRam ?? {});

        freeWorkerThreads -= 1;

        let targetServers = [...globalThis.servers.values()]
            .filter((server) => {
                return (
                    !promises.has(server.hostname) &&
                    !exclude.has(server.hostname) &&
                    !server.purchasedByPlayer &&
                    server.hasAdminRights &&
                    (server.moneyMax ?? 0) > 0 &&
                    server.requiredHackingSkill <= ns.getHackingLevel()
                );
            })
            .sort((a, b) => rateServer(b, freeWorkerThreads) - rateServer(a, freeWorkerThreads));

        if (settings.limitServers && settings.limitServers > 0) {
            const current = promises.size;
            targetServers = targetServers
                .filter((server) => {
                    const hackRatio = approximateOptimalHackRatio(server.hostname, freeWorkerThreads);
                    const threads = pool.calculateBatchRatios(server.hostname, hackRatio).total;
                    const passed = threads <= freeWorkerThreads;
                    ns.print(`INFO: ${server.hostname}: ${passed ? "Passed" : "Failed"} - ${hackRatio}, ${threads}`);
                    return passed;
                })
                .slice(0, settings.limitServers - current);
        }

        for (const server of targetServers) {
            ns.writePort(MONITORING_PORT, {
                event: "add",
                data: { target: server.hostname },
            });

            const hostLog = `\x1b[1m${server.hostname}\x1b[0m`;

            const hackRatio = approximateOptimalHackRatio(server.hostname, freeWorkerThreads);
            if (hackRatio === 0) {
                markIdle(server);
                continue;
            }

            const totalBatchThreads = pool.calculateBatchRatios(server.hostname, hackRatio).total;
            if (totalBatchThreads > freeWorkerThreads) {
                markIdle(server);
                continue;
            }

            let promise;
            if (!isPrepared(server)) {
                const { weakenThreads, growThreads } = getPreparationThreads(server.hostname, freeWorkerThreads);
                const total = weakenThreads + growThreads;
                // should never be case, but eh. better be safe than sorry.
                if (total > freeWorkerThreads) {
                    markIdle(server);
                    continue;
                }

                if (weakenThreads <= 0 && growThreads <= 0) {
                    ns.writePort(MONITORING_PORT, {
                        event: "setStatus",
                        data: { status: "idle", target: server.hostname },
                    });
                }

                let weakenGroup = undefined;
                if (weakenThreads > 0) {
                    weakenGroup = pool.reserveGroup(weakenThreads, {
                        mode: WorkerMode.Weaken,
                        target: server.hostname,
                    });
                }

                if (weakenThreads > 0 && !weakenGroup) {
                    ns.print(`ERROR: Failed to reserve weaken group with ${weakenThreads}t for ${hostLog}`);
                    markIdle(server);
                    continue;
                }

                let growGroup;
                if (growThreads > 0) {
                    growGroup = pool.reserveGroup(growThreads, {
                        mode: WorkerMode.Grow,
                        target: server.hostname,
                    });
                }

                if (growThreads > 0 && !growGroup) {
                    ns.print(`ERROR: Failed to reserve weaken group with ${growThreads}t for ${hostLog}`);
                    weakenGroup?.stop();
                    markIdle(server);
                    continue;
                }

                ns.writePort(MONITORING_PORT, {
                    event: "setStatus",
                    data: {
                        status: "preparing",
                        target: server.hostname,
                        threads: { weaken: weakenThreads, grow: growThreads },
                    },
                });
                freeWorkerThreads -= total;

                promise = (async () => {
                    await prepare(
                        server.hostname,
                        weakenGroup as WorkerGroup | undefined,
                        growGroup as WorkerGroup | undefined,
                    );

                    weakenGroup?.stop();
                    growGroup?.stop();
                })();
            } else {
                const threads = pool.calculateBatchRatios(server.hostname, hackRatio);

                ns.print(`INFO: Reserving workers targeting ${hostLog} for a hack ratio of ${hackRatio}.`);
                const batch = pool.reserveBatch(server.hostname, {
                    hackRatio,
                    groupOptions: { target: server.hostname },
                });

                if (!batch || !batch.runnable) {
                    ns.print(`INFO: Could not reserve workers for ${hostLog}.`);
                    batch?.stop();
                    markIdle(server);
                    continue;
                }

                ns.writePort(MONITORING_PORT, {
                    event: "setStatus",
                    data: {
                        status: "hack",
                        target: server.hostname,
                        threads: {
                            hack: threads.hackThreads,
                            grow: threads.growThreads,
                            weaken: threads.growWeakenThreads + threads.hackWeakenThreads,
                        },
                        hackRatio,
                    },
                });
                freeWorkerThreads -= threads.total;

                promise = (async () => {
                    ns.print(`INFO: Hacking ${hostLog}.`);
                    const hacked = (await batch.work()) ?? 0;
                    ns.print(`INFO: Hacked ${hostLog} for \$${ns.formatNumber(hacked)}.`);
                    batch.stop();
                    ns.writePort(MONITORING_PORT, {
                        event: "hacked",
                        data: { amount: hacked, target: server.hostname },
                    });
                    profit += hacked;
                })();
            }

            promises.set(
                server.hostname,
                promise?.finally(() => {
                    promises.delete(server.hostname);
                }),
            );
        }

        await ns.asleep(20);
    }
}
