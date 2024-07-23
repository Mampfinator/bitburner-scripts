import { NS } from "@ns";
import { calcThreads } from "/lib/network-threads";
import { Worker, WorkerOptions, WorkResult } from "./worker";
import {
    POOL_MESSAGE_PORT_BASE,
    WORKER_MESSAGE_PORT,
    WORKER_SCRIPTS,
    WorkerMode,
} from "./consts";
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

    workerRam: Record<WorkerMode, number>;

    get reservedRam() {
        return Object.values(this.options?.reserveRam ?? {}).reduce(
            (total, current) => total + current,
            0,
        );
    }

    /**
     * @param {NS} ns
     * @param {{ reserveRam?: Record<string, number> } | undefined} options
     */
    constructor(ns: NS, options?: PoolOptions) {
        this.ns = ns;

        this.ns.atExit(() => {
            this.killAll();
        }, "workerpool-cleanup");

        globalThis.eventEmitter.register(
            ns,
            "worker:done",
            (data: WorkResult &  {pid: number} ) => {
                this.byPids.get(data.pid)?.done({ ...data });
            },
        );

        globalThis.eventEmitter.register(
            ns,
            "worker:resumed",
            ({ pid }: { pid: number }) => {
                this.resumeResolvers.get(pid)?.(true);
            },
        );

        globalThis.eventEmitter.register(
            ns,
            "worker:started",
            ({ pid }: { pid: number }) => {
                this.startResolvers.get(pid)?.(true);
            },
        );

        globalThis.eventEmitter.register(
            this.ns,
            "worker:killed",
            ({ pid }: { pid: number }) => {
                if (this.ns.isRunning(pid)) {
                    this.ns.print(
                        `WARNING: Got killed event from ${pid}, but worker still exists. Forgetting, but not killing.`,
                    );
                    return;
                }
                const worker = this.byPids.get(pid);
                if (!worker) {
                    this.ns.print(
                        `WARNING: Got killed event from ${pid} but worker did not exist.`,
                    );
                    return;
                }
                this.byPids.delete(pid);
            },
        );

        this.options = options ?? {};

        this.workerRam = {
            [WorkerMode.Hack]: ns.getScriptRam(WORKER_SCRIPTS[WorkerMode.Hack]),
            [WorkerMode.Grow]: ns.getScriptRam(WORKER_SCRIPTS[WorkerMode.Grow]),
            [WorkerMode.Weaken]: ns.getScriptRam(
                WORKER_SCRIPTS[WorkerMode.Weaken],
            ),
        };
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
     * Reserve a worker group with `numThreads` threads.
     */
    reserveGroup(
        numThreads: number,
        options: Omit<WorkerOptions, "threads">,
    ): WorkerGroup | null {
        if (numThreads === 0) return null;

        const totalMem = numThreads * this.workerRam[options.mode];
        const reservations = globalThis.system.memory.reserveTotal(totalMem);

        if (!reservations) return null;

        const workers = new Set<Worker>();
        for (const reservation of reservations) {
            try {
                const size = globalThis.system.memory.sizeOf(reservation)!;
                const workerThreads = Math.floor(size / this.workerRam[options.mode]);

                workers.add(
                    new Worker(this.ns, this, {
                        ...options,
                        threads: workerThreads,
                        useReservation: reservation,
                    }),
                );
            } catch (e) {
                for (const worker of workers) worker.kill();
                for (const reservation of reservations)
                    globalThis.system.memory.free(reservation);
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
     */
    reserveBatch(
        hostname: string,
        options: { hackRatio?: number; groupOptions: Omit<WorkerOptions, "threads" | "mode"> },
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
            ...options.groupOptions,
        };

        const hackGroup = this.reserveGroup(hackThreads, {...groupOptions, mode: WorkerMode.Hack});
        const hackWeakenGroup = this.reserveGroup(
            hackWeakenThreads,
            {...groupOptions, mode: WorkerMode.Weaken},
        );

        const growGroup = this.reserveGroup(growThreads, {...groupOptions, mode: WorkerMode.Grow});
        const growWeakenGroup = this.reserveGroup(
            growWeakenThreads,
            {...groupOptions, mode: WorkerMode.Weaken},
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
