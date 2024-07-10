import { NS } from "@ns";
import { getServers } from "/lib/servers/servers";
import { calcThreads } from "/lib/network-threads";

const POOL_MESSAGE_PORT_BASE = 1000;
const WORKER_MESSAGE_PORT = 10000;

export interface WorkerOptions {
    autoContinue?: boolean;
    initialMode?: WorkerMode;
}

export enum WorkerMode {
    Hack = "hack",
    Grow = "grow",
    Weaken = "weaken",
}

/**
 * Represents a remote Worker.
 */
export class Worker {
    ns: NS;
    pool: WorkerPool;
    hostname: string;
    target: string | undefined;
    mode: WorkerMode | undefined;
    threads: number = 0;
    pid: number = 0;

    [Symbol.toPrimitive]() {
        return `Worker(${this.running ? this.pid : "DEAD"}:${this.mode}:${this.hostname}=>${this.target})`;
    }

    /**
     * @param {NS} ns
     * @param {WorkerPool} pool
     * @param {string} hostname
     * @param {number} threads
     */
    constructor(
        ns: NS,
        pool: WorkerPool,
        hostname: string,
        threads: number,
        options?: WorkerOptions,
    ) {
        this.ns = ns;
        this.pool = pool;

        this.hostname = hostname;
        this.threads = threads;
        if (options?.initialMode) this.mode = options.initialMode;

        const pid = this.ns.exec(
            "hacking/worker.js",
            this.hostname,
            { threads: this.threads, temporary: true },
            this.pool.listenPort,
            this.target ?? "",
            this.mode ?? "",
            options?.autoContinue ?? true,
        );
        if (pid === 0) {
            throw new Error(
                `Couldn't start ${this}: Failed to start worker.js.`,
            );
        }

        this.pid = pid;
        this.pool.byPids.set(this.pid, this);
        this.pool.free.add(this);
    }

    get usedRam() {
        return this.threads * this.pool.workerRam;
    }
    get running() {
        const running = this.ns.isRunning(this.pid);
        if (!running) this.pool.forget(this);

        return running;
    }

    /**
     * Kill this Worker's process.
     */
    kill() {
        this.target = undefined;
        this.mode = undefined;

        this.ns.kill(this.pid);

        this.pid = 0;

        this.pool.forget(this);
    }

    /**
     * Start the remote worker.
     * @returns { Promise<boolean> } a Promise that resolves when the Worker starts working.
     */
    start(target: string, mode: WorkerMode, autoContinue: boolean = false) {
        if (!this.ns.serverExists(target))
            throw new Error(`Server with hostname ${target} doesn't exist.`);
        if (this.pool.startResolvers.has(this.pid))
            throw new Error(`Already attempting to start ${this}.`);

        this.send("start", {
            target,
            mode,
            autoContinue,
        });

        return new Promise((res) => {
            this.pool.startResolvers.set(this.pid, res);
        });
    }

    #nextDonePromise: null | Promise<{
        target: string;
        mode: string;
        result: number;
    }> = null;
    #nextDoneRes:
        | null
        | ((result: { target: string; mode: string; result: number }) => void) =
        null;

    /**
     * Returns a Promise that returns when the Worker finishes its current task.
     */
    nextDone() {
        if (!this.#nextDonePromise) {
            this.#nextDonePromise = new Promise<{
                target: string;
                mode: string;
                result: number;
            }>((resolve) => {
                this.#nextDoneRes = resolve;
            });
        }

        return this.#nextDonePromise;
    }

    /**
     * @param result the worker's reported result.
     */
    done(result: { target: string; mode: string; result: number }) {
        this.#nextDoneRes?.(result);
        this.#nextDonePromise = null;
        this.#nextDoneRes = null;
    }

    /**
     * Send a message to this worker.
     */
    send(event: string, data: Record<string, any>) {
        if (!this.running) return;

        this.ns.writePort(WORKER_MESSAGE_PORT + this.pid, {
            event,
            pid: this.pid,
            data,
        });
    }

    stop() {
        this.send("stop", {});
    }

    resume() {
        if (this.pool.resumeResolvers.has(this.pid))
            throw new Error(`Already attempting to resume ${this}.`);

        this.send("resume", {});

        return new Promise((res) => {
            this.pool.resumeResolvers.set(this.pid, res);
        });
    }
}

export interface PoolOptions {
    reserveRam?: Record<string, number>;
    excludeServers?: Set<string>;
}

export class WorkerPool {
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
     * @param {number} numThreads - amount of threads to use for this group. If there are fewer threads than specified available in the network, returns `null`.
     * @param { { autoContinue?: boolean } }
     * @returns {WorkerGroup | null}
     */
    reserveGroup(numThreads: number, options?: WorkerOptions) {
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

export class WorkerGroup {
    workers: Set<Worker>;
    ns: NS;
    pool: WorkerPool;

    [Symbol.toPrimitive]() {
        return `WorkerGroup(${[...this.workers.values()].map((w) => w.pid).join()})`;
    }

    constructor(workers: Set<Worker>) {
        this.workers = workers;

        if (workers.size <= 0)
            throw new Error(`Invalid Worker set for WorkerGroup.`);

        const example = this.workers.values().next()!;
        this.ns = example.value.ns;
        this.pool = example.value.pool;
    }

    get threads() {
        return [...this.workers].reduce(
            (acc, worker) => acc + worker.threads,
            0,
        );
    }

    get ram() {
        return this.threads * this.pool.workerRam;
    }

    /**
     * @param {string} target
     * @param { "hack" | "weaken" | "grow" } mode
     * @param { boolean } autoContinue
     * @returns {Promise<boolean>} Whether starting the group was successful. If this is false, all workers have already been freed and this group can no longer be used.
     */
    async start(
        target: string,
        mode: WorkerMode,
        autoContinue: boolean = false,
    ) {
        const result = await Promise.all(
            [...this.workers.values()].map((worker) =>
                worker.start(target, mode, autoContinue),
            ),
        );

        // if any single worker failed starting, we abort here and free all workers.
        if (result.some((res) => !res)) {
            for (const worker of this.workers) {
                worker.kill();
            }
        }
    }

    async nextDone() {
        const results = await Promise.all(
            [...this.workers].map((worker) => worker.nextDone()),
        );
        return {
            target: results[0].target,
            mode: results[0].mode,
            result: results.reduce((acc, { result }) => acc + result, 0),
        };
    }

    kill() {
        for (const worker of this.workers) {
            worker.kill();
        }
    }
}

export const DELAY = 200;

/**
 * A Hack->Weaken->Grow->Weaken worker batch.
 */
export class HWGWWorkerBatch {
    constructor(
        private readonly ns: NS,
        private readonly target: string,
        private readonly weakenGrow: WorkerGroup,
        private readonly weakenHack: WorkerGroup,
        private readonly grow: WorkerGroup,
        private readonly hack: WorkerGroup,
    ) {}

    /**
     * Runs this batch once.
     * @returns the amount of money stolen, or null if the batch failed to run.
     */
    async run(): Promise<number | null> {
        if (!this.runnable) {
            this.ns.tprint(
                `Failed to start batch for ${this.target}. ${this.hack ? "Hack exists" : "Hack is null"} : ${this.grow ? "Grow exists" : "Grow is null"}.`,
            );
            return null;
        }

        let startedAt = Date.now();

        const hackTime = this.ns.getHackTime(this.target);
        const weakenTime = this.ns.getWeakenTime(this.target);
        const growTime = this.ns.getGrowTime(this.target);

        this.weakenHack.start(this.target, WorkerMode.Weaken);

        let hackPromise = this.ns
            .asleep(weakenTime - hackTime - DELAY)
            .then(() => this.hack.start(this.target, WorkerMode.Hack));

        await this.ns.asleep(DELAY);

        await this.weakenGrow.start(this.target, WorkerMode.Weaken);
        let growPromise = this.ns
            .asleep(weakenTime - growTime - DELAY)
            .then(() => this.grow.start(this.target, WorkerMode.Grow));

        await Promise.all([hackPromise, growPromise]);

        let hackingDone = false;
        let growingDone = false;

        const [hackResult] = await Promise.all([
            this.hack.nextDone().then((res) => {
                hackingDone = true;
                return res;
            }),
            this.grow.nextDone().then((res) => {
                growingDone = true;
                return res;
            }),
            this.weakenHack.nextDone().then((res) => {
                //if (!hackingDone) this.ns.toast(`${this.target}: Weaken Hack finished before hacking completed.`, "error", null);
                return res;
            }),
            this.weakenGrow.nextDone().then((res) => {
                //if (!growingDone) this.ns.toast(`${this.target}: Weaken Grow finished before growing completed.`, "error", null);
                return res;
            }),
        ]);

        return hackResult.result;
    }

    async altRun() {
        if (!this.runnable) {
            this.ns.tprint(
                `Failed to start batch for ${this.target}. ${this.hack ? "Hack exists" : "Hack is null"} : ${this.grow ? "Grow exists" : "Grow is null"}.`,
            );
            return null;
        }

        const hackTime = this.ns.getHackTime(this.target);
        const weakenTime = this.ns.getWeakenTime(this.target);
        const growTime = this.ns.getGrowTime(this.target);
        const startedAt = Date.now();

        let hackFinishedAt: number;
        let weakenHFinishedAt: number;
        let growFinishedAt: number;
        let weakenGFinishedAt: number;

        const donePromises = [
            this.hack.nextDone().then(() => {
                hackFinishedAt = Date.now();
                console.log(
                    `Hack workers finished at ${(hackFinishedAt - startedAt).toFixed(2)}ms.`,
                );
            }),
            this.weakenHack.nextDone().then(() => {
                weakenHFinishedAt = Date.now();
                console.log(
                    `WeakenH workers finished at ${(weakenHFinishedAt - startedAt).toFixed(2)}ms`,
                );
            }),
            this.grow.nextDone().then(() => {
                growFinishedAt = Date.now();
                console.log(
                    `Grow workers finished at ${(growFinishedAt - startedAt).toFixed(2)}ms`,
                );
            }),
            this.weakenGrow.nextDone().then(() => {
                weakenGFinishedAt = Date.now();
                console.log(
                    `WeakenG workers finished at ${(weakenGFinishedAt - startedAt).toFixed(2)}ms`,
                );
            }),
        ];

        this.ns.print(`Starting workers for ${this.target}.`);

        await this.weakenHack
            .start(this.target, WorkerMode.Weaken)
            .then((r) => {
                console.log(
                    `Starting weaken hack workers took ${Date.now() - startedAt}ms.`,
                );
                return r;
            });

        const finishHackAt = weakenTime - DELAY;
        const startHackDelay = finishHackAt - hackTime;

        const hackPromise = this.ns.asleep(startHackDelay).then(async () => {
            const before = Date.now();
            const r = await this.hack.start(this.target, WorkerMode.Hack);
            console.log(`Starting hack workers took ${Date.now() - before}ms`);
            return r;
        });

        const finishGrowAt = finishHackAt + DELAY;
        const startGrowDelay = finishGrowAt - growTime;
        const growPromise = this.ns.asleep(startGrowDelay).then(async () => {
            const before = Date.now();
            const r = await this.grow.start(this.target, WorkerMode.Grow);
            console.log(`Starting grow workers took ${Date.now() - before}ms`);
            return r;
        });

        const finishGrowWeakenAt = finishGrowAt + DELAY;
        const startGrowWeakenDelay = finishGrowWeakenAt - growTime;
        const growWeakenPromise = this.ns
            .asleep(startGrowWeakenDelay)
            .then(async () => {
                const before = Date.now();
                const sec = this.ns.getServerSecurityLevel(this.target);
                const t = this.ns.getWeakenTime(this.target);
                console.log(
                    `Grow weaken: started with ${sec} (${this.ns.getServerMinSecurityLevel(this.target)}) security. Expected to take ${t}ms (${weakenTime}ms).`,
                );
                const r = await this.weakenGrow.start(
                    this.target,
                    WorkerMode.Weaken,
                );
                console.log(
                    `Starting weaken grow workers took ${Date.now() - before}ms`,
                );
                return r;
            });

        await Promise.all([hackPromise, growPromise, growWeakenPromise]);

        const hackResultPromise = this.hack.nextDone();

        await Promise.all(donePromises);

        console.log(
            [
                [
                    "weakenH",
                    weakenHFinishedAt! - startedAt,
                    weakenTime,
                ] as const,
                ["hack", hackFinishedAt! - startedAt, finishHackAt] as const,
                ["grow", growFinishedAt! - startedAt, finishGrowAt] as const,
                [
                    "weakenG",
                    weakenGFinishedAt! - startedAt,
                    finishGrowWeakenAt,
                ] as const,
            ].sort(([, a], [, b]) => a - b),
        );

        const { result } = await hackResultPromise;
        return result;
    }

    getDoneTime() {
        return this.ns.getWeakenTime(this.target) + 3 * DELAY;
    }

    get runnable() {
        return (
            this.weakenGrow !== null &&
            this.weakenHack !== null &&
            this.hack !== null &&
            this.grow !== null
        );
    }

    /**
     * Kill every worker in this batch. Effectively makes this worker unusable.
     */
    kill() {
        this.weakenGrow?.kill();
        this.weakenHack?.kill();
        this.hack?.kill();
        this.grow?.kill();
    }
}
