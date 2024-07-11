import { NS } from "@ns";
import { WORKER_MESSAGE_PORT, WorkerMode } from "./consts";
import { WorkerPool } from "./pool";

export interface WorkerOptions {
    autoContinue?: boolean;
    initialMode?: WorkerMode;
}

/**
 * Represents a remote instance of `hacking/worker.js`.
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
