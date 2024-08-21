import { NS } from "@ns";
import { Worker, WorkerOptions, WorkResult } from "./workers/worker";
import { getWorkerScriptCost, WorkerMode } from "./consts";
import { HWGWWorkerBatch } from "./workers/batch";
import { WorkerGroup } from "./workers/group";
import { OK, Reservation, reserveThreads, ReserveThreadsError } from "/system/memory";

export interface PoolOptions {
    reserveRam?: Record<string, number>;
    excludeServers?: Set<string>;
}

export class WorkerPool implements Disposable {
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

    workerRam: Record<WorkerMode, number>;

    private readonly cleanupFns: (() => void)[] = [];

    get reservedRam() {
        return Object.values(this.options?.reserveRam ?? {}).reduce((total, current) => total + current, 0);
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

        this.cleanupFns = [
            globalThis.eventEmitter.withCleanup(
                "worker:done",
                (data: WorkResult & { pid: number }) => {
                    this.byPids.get(data.pid)?.done({ ...data });
                },
                ns,
            ),
            globalThis.eventEmitter.withCleanup(
                "worker:killed",
                ({ pid }: { pid: number }) => {
                    const worker = this.byPids.get(pid);
                    if (!worker) {
                        this.ns.print(`WARNING: Got killed event from ${pid} but worker did not exist.`);
                        return;
                    }
                    this.byPids.delete(pid);
                },
                ns,
            ),
        ];

        this.options = options ?? {};

        this.workerRam = {
            [WorkerMode.Hack]: getWorkerScriptCost(ns, WorkerMode.Hack),
            [WorkerMode.Grow]: getWorkerScriptCost(ns, WorkerMode.Grow),
            [WorkerMode.Weaken]: getWorkerScriptCost(ns, WorkerMode.Weaken),
        };
    }
    [Symbol.dispose](): void {
        this.killAll();
        this.cleanupFns.forEach((fn) => fn());
    }

    /**
     * Forgets a Worker.
     */
    forget(worker: Worker) {
        this.byPids.delete(worker.pid);
        this.free.delete(worker);
    }

    /**
     * Kill all Workers.
     */
    killAll() {
        for (const worker of this.byPids.values()) {
            worker.stop();
        }
    }

    /**
     * Reserve a worker group with `numThreads` threads.
     */
    reserveGroup(numThreads: number, options: Omit<WorkerOptions, "threads">): WorkerGroup | null {
        if (numThreads === 0) return null;

        const threadSize = this.workerRam[options.mode];
        const { result, reservations } = reserveThreads(numThreads, threadSize, options.mode);

        if (result !== OK) {
            if (result !== ReserveThreadsError.OutOfMemory)
                console.warn(
                    `Could not reserve ${this.ns.formatRam(numThreads * threadSize)} (${this.ns.formatNumber(numThreads)}t) for worker batch. Code: ${result}. Aborting.`,
                );
            return null;
        }

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
                console.error(e);

                for (const worker of workers) worker.stop();
                for (const reservation of reservations) globalThis.system.memory.free(reservation);
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
        const server = globalThis.servers.get(hostname)!;

        const hackAmount = (server.moneyAvailable ?? 0) * hackRatio;

        const hackThreads = Math.max(Math.floor(this.ns.hackAnalyzeThreads(server.hostname, hackAmount)), 1);

        const hackSecIncrease = this.ns.hackAnalyzeSecurity(hackThreads);
        const hackWeakenThreads = Math.ceil(hackSecIncrease / 0.05);

        const growThreads = Math.ceil(this.ns.growthAnalyze(server.hostname, 1 / (1 - hackRatio)));
        const growSecIncrease = this.ns.growthAnalyzeSecurity(growThreads);
        const growWeakenThreads = Math.ceil(growSecIncrease / 0.05);

        const workerRam = this.workerRam;

        return {
            hackThreads,
            hackWeakenThreads,
            growThreads,
            growWeakenThreads,
            get total() {
                return this.hackThreads + this.hackWeakenThreads + this.growThreads + this.growWeakenThreads;
            },
            get totalRam() {
                return this.hackThreads * workerRam[WorkerMode.Hack] + this.hackWeakenThreads * workerRam[WorkerMode.Weaken] +
                    this.growThreads * workerRam[WorkerMode.Grow] + this.growWeakenThreads * workerRam[WorkerMode.Weaken];
            }
        };
    }

    /**
     * @param hostname target hostname
     */
    reserveBatch(
        hostname: string,
        options: {
            hackRatio?: number;
            groupOptions: Omit<WorkerOptions, "threads" | "mode" | "useReservation"> & {
                reservations?: Record<"hack" | "hackWeaken" | "grow" | "growWeaken", Reservation>;
            };
        },
    ): HWGWWorkerBatch | null {
        const server = globalThis.servers.get(hostname);
        if (!server || server.minDifficulty !== server.hackDifficulty) {
            return null;
        }

        const { hackThreads, hackWeakenThreads, growThreads, growWeakenThreads } = this.calculateBatchRatios(
            hostname,
            options?.hackRatio,
        );

        const groupOptions = {
            autoContinue: false,
            ...options.groupOptions,
        };

        const hackGroup = this.reserveGroup(hackThreads, {
            ...groupOptions,
            useReservation: options.groupOptions.reservations?.["hack"],
            mode: WorkerMode.Hack,
        });
        const hackWeakenGroup = this.reserveGroup(hackWeakenThreads, {
            ...groupOptions,
            useReservation: options.groupOptions.reservations?.["hackWeaken"],
            mode: WorkerMode.Weaken,
        });

        const growGroup = this.reserveGroup(growThreads, {
            ...groupOptions,
            useReservation: options.groupOptions.reservations?.["grow"],
            mode: WorkerMode.Grow,
        });
        const growWeakenGroup = this.reserveGroup(growWeakenThreads, {
            ...groupOptions,
            useReservation: options.groupOptions.reservations?.["growWeaken"],
            mode: WorkerMode.Weaken,
        });

        if (hackGroup === null || hackWeakenGroup === null || growGroup === null || growWeakenGroup === null) {
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
                this.reservedRam,
            );

            hackGroup?.stop();
            hackWeakenGroup?.stop();
            growGroup?.stop();
            growWeakenGroup?.stop();

            return null;
        }

        return new HWGWWorkerBatch(this.ns, hostname, growWeakenGroup, hackWeakenGroup, growGroup, hackGroup);
    }
}
