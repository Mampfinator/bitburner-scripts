import { NS } from "@ns";
import { getServers } from "/lib/servers/servers";
import { calcThreads } from "/lib/network-threads";
import { Worker, WorkerOptions } from "./worker";
import { POOL_MESSAGE_PORT_BASE, WORKER_MESSAGE_PORT } from "./consts";
import { HWGWWorkerBatch } from "./batch";
import { WorkerGroup } from "./group";

export interface PoolOptions {
    reserveRam?: Record<string, number>;
    excludeServers?: Set<string>;
}

export class WorkerPool {
    static instance: WorkerPool | null = null;

    static singleton(ns: NS, options?: PoolOptions) {
        this.instance = new WorkerPool(ns, options);
    }

    ns: NS;
    /**
     * How much RAM is needed to run a single Worker.
     */
    workerRam: number;
    options: PoolOptions;
    /**
     * PIDs of running Workers.
     */
    byPids = new Map<number, Worker>();
    /**
     * All workers that currently have nothing to do.
     */
    free = new WeakSet();
    startResolvers = new Map<number, (started: boolean) => void>();
    resumeResolvers = new Map<number, (resumed: boolean) => void>();

    get reservedRam() {
        return Object.values(this.options?.reserveRam ?? {}).reduce(
            (total, current) => total + current,
            0,
        );
    }

    get reservedThreads() {
        return Math.ceil(this.reservedRam / this.workerRam);
    }

    /**
     * @param {NS} ns
     * @param {{ reserveRam?: Record<string, number> } | undefined} options
     */
    constructor(ns: NS, options?: PoolOptions) {
        this.ns = ns;
        this.workerRam = this.ns.getScriptRam("hacking/worker.js");

        if (this.workerRam === 0)
            throw new Error(`Could not find worker script.`);

        this.ns.atExit(() => {
            this.killAll();
        }, "workerpool-cleanup");

        this.options = options ?? {};
    }

    get listenPort() {
        const port = POOL_MESSAGE_PORT_BASE + this.ns.pid;

        if (port > WORKER_MESSAGE_PORT)
            throw new Error(`TOO MANY SERVERS/PROCESSES`);

        return port;
    }

    /**
     * Forgets a Worker.
     */
    forget(worker: Worker) {
        this.byPids.delete(worker.pid);
        this.free.delete(worker);

        this.startResolvers.get(worker.pid)?.(false);
        this.resumeResolvers.get(worker.pid)?.(false);
    }

    /**
     * Kill all Workers.
     */
    killAll() {
        for (const worker of this.byPids.values()) {
            worker.kill();
        }
    }

    *readPort(): Generator<
        { event: string; pid: number; data: Record<string, any> },
        void
    > {
        const port = this.ns.getPortHandle(this.listenPort);

        if (port.empty()) return;

        while (true) {
            const message = port.read();
            if (message === "NULL PORT DATA") return;

            if (!message || typeof message !== "object") continue;
            yield message;
        }
    }

    /**
     * Act on incoming messages from workers.
     * Should be called in a `while(true)` loop with a decently low `ns.(a)sleep` between every call.
     */
    processMessages() {
        for (const { event, pid, data } of this.readPort()) {
            // Worker was shut down.
            if (event === "killed") {
                if (this.ns.isRunning(pid)) {
                    this.ns.tprint(
                        `WARNING: Got killed event from ${pid}, but worker still exists. Forgetting, but not killing.`,
                    );
                }
                const worker = this.byPids.get(pid);
                if (!worker) {
                    this.ns.print(
                        `WARNING: Got killed event from ${pid} but worker did not exist.`,
                    );
                    continue;
                }
                this.byPids.delete(pid);
            } else if (event === "started") {
                this.startResolvers.get(pid)?.(true);
                this.startResolvers.delete(pid);
            } else if (event === "resumed") {
                this.resumeResolvers.get(pid)?.(true);
                this.resumeResolvers.delete(pid);
            } else if (event === "done") {
                this.byPids.get(pid)?.done(data as any);
            }
        }
    }

    /**
     * Reserve a worker group with `numThreads` threads.
     */
    reserveGroup(
        numThreads: number,
        options?: WorkerOptions,
    ): WorkerGroup | null {
        if (numThreads === 0) return null;

        const servers = getServers(this.ns).filter((server) => {
            return (
                server.hasAdminRights &&
                server.maxRam -
                    server.ramUsed -
                    (this.options.reserveRam?.[server.hostname] ?? 0) >
                    this.workerRam &&
                !this.options.excludeServers?.has(server.hostname)
            );
        });

        let remainingThreads = numThreads;

        const workerNodes: [string, number][] = [];

        for (const server of servers) {
            if (remainingThreads === 0) break;

            const useThreads = Math.min(
                Math.floor(
                    (server.maxRam -
                        server.ramUsed -
                        (this.options.reserveRam?.[server.hostname] ?? 0)) /
                        this.workerRam,
                ),
                remainingThreads,
            );

            workerNodes.push([server.hostname, useThreads]);

            remainingThreads -= useThreads;
        }

        // there aren't enough threads available to spawn this group.
        if (remainingThreads > 0) return null;

        const workers = new Set<Worker>();

        for (const [hostname, threads] of workerNodes) {
            try {
                const worker = new Worker(
                    this.ns,
                    this,
                    hostname,
                    threads,
                    options,
                );
                workers.add(worker);
            } catch {
                for (const worker of workers) {
                    worker.kill();
                }

                return null;
            }
        }

        return new WorkerGroup(workers);
    }

    /**
     * @param hostname
     * @param hackRatio how much in % of a target's money to hack in a single cycle.
     */
    calculateBatchRatios(hostname: string, hackRatio: number = 0.35) {
        const server = this.ns.getServer(hostname);

        const hackAmount = (server.moneyAvailable ?? 0) * hackRatio;

        const hackThreads = Math.floor(
            this.ns.hackAnalyzeThreads(server.hostname, hackAmount),
        );

        if (hackThreads < 0) {
            //this.ns.print(`WARNING: Invalid hackThreads amount for ${hostname}/${hackRatio} (${this.ns.formatNumber(server.moneyMax - server.moneyAvailable)}/\$${this.ns.formatNumber(server.moneyMax)}) - ${hackThreads}. Did you prepare the server before calling this?`);
            //console.log(`${hostname}/${hackRatio} (${this.ns.formatNumber(server.moneyMax - server.moneyAvailable)}/\$${this.ns.formatNumber(server.moneyMax)}) - ${hackThreads}. Did you prepare the server before calling this?`);
            return {
                hackThreads: 0,
                hackWeakenThreads: 0,
                growThreads: 0,
                growWeakenThreads: 0,
                total: 0,
            };
        }

        const hackSecIncrease = this.ns.hackAnalyzeSecurity(hackThreads);
        const hackWeakenThreads = Math.ceil(hackSecIncrease / 0.05);

        const growThreads = Math.ceil(
            this.ns.growthAnalyze(server.hostname, 1 / (1 - hackRatio)),
        );
        const growSecIncrease = this.ns.growthAnalyzeSecurity(growThreads);
        const growWeakenThreads = Math.ceil(growSecIncrease / 0.05);

        return {
            hackThreads,
            hackWeakenThreads,
            growThreads,
            growWeakenThreads,
            get total() {
                return (
                    this.hackThreads +
                    this.hackWeakenThreads +
                    this.growThreads +
                    this.growWeakenThreads
                );
            },
        };
    }

    /**
     * @param hostname target hostname
     * @param hackRatio how much (in %) of the server's money to hack in each cycle.
     */
    reserveBatch(
        hostname: string,
        options?: { hackRatio?: number; groupOptions?: WorkerOptions },
    ): HWGWWorkerBatch | null {
        if (
            this.ns.getServerMinSecurityLevel(hostname) !==
            this.ns.getServerSecurityLevel(hostname)
        ) {
            return null;
        }

        const {
            hackThreads,
            hackWeakenThreads,
            growThreads,
            growWeakenThreads,
        } = this.calculateBatchRatios(hostname, options?.hackRatio);

        const groupOptions = {
            autoContinue: false,
            ...(options?.groupOptions ?? {}),
        };

        const hackGroup = this.reserveGroup(hackThreads, groupOptions);
        const hackWeakenGroup = this.reserveGroup(
            hackWeakenThreads,
            groupOptions,
        );

        const growGroup = this.reserveGroup(growThreads, groupOptions);
        const growWeakenGroup = this.reserveGroup(
            growWeakenThreads,
            groupOptions,
        );

        if (
            hackGroup === null ||
            hackWeakenGroup === null ||
            growGroup === null ||
            growWeakenGroup === null
        ) {
            this.ns.print(
                `ERROR: Could not reserve threads for a batch. hack: ${hackGroup} (${hackThreads}t); hackWeaken: ${hackWeakenGroup} (${hackWeakenThreads}t); grow: ${growGroup} (${growThreads}t); growWeaken: ${growWeakenGroup} (${growWeakenThreads}t)`,
            );

            console.error(
                `Could not reserve threads for a batch. hack: ${hackGroup} (${hackThreads}t); hackWeaken: ${hackWeakenGroup} (${hackWeakenThreads}t); grow: ${growGroup} (${growThreads}t); growWeaken: ${growWeakenGroup} (${growWeakenThreads}t)`,
            );
            console.log(
                hostname,
                hackThreads,
                hackGroup,
                hackWeakenThreads,
                hackWeakenGroup,
                growThreads,
                growGroup,
                growWeakenThreads,
                growWeakenGroup,
                groupOptions,
                calcThreads(this.ns),
                this.reservedRam,
                this.reservedThreads,
            );

            hackGroup?.kill();
            hackWeakenGroup?.kill();
            growGroup?.kill();
            growWeakenGroup?.kill();

            return null;
        }

        return new HWGWWorkerBatch(
            this.ns,
            hostname,
            growWeakenGroup,
            hackWeakenGroup,
            growGroup,
            hackGroup,
        );
    }
}
