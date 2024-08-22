import { BasicHGWOptions, NS } from "@ns";
import { WORKER_MESSAGE_PORT, WORKER_SCRIPT_PATH, WorkerMessage, WorkerMode } from "../consts";
import { WorkerPool } from "../pool";
import { run as runScript } from "../../system/proc/run";
import { Reservation } from "/system/memory";

export interface WorkResult {
    target: string;
    mode: WorkerMode;
    result: number;
}

export interface WorkerOptions {
    /**
     * @default false
     */
    autoContinue?: boolean;
    useReservation?: Reservation;
    /**
     * Server to launch this worker on. If not set, finds a suitable one automatically.
     */
    onServer?: string;
    threads: number;
    target: string;
    mode: WorkerMode;
}

/**
 * Represents a remote instance of `hacking/worker.js`.
 */
export class Worker {
    ns: NS;
    pool: WorkerPool;
    target: string;
    mode: WorkerMode;
    threads: number = 0;
    pid: number = 0;
    awaitKilled: Promise<void>;
    private readonly reservation;

    [Symbol.toPrimitive]() {
        return `Worker(${this.running ? this.pid : "DEAD"}:${this.mode}=>${this.target})`;
    }

    constructor(ns: NS, pool: WorkerPool, options: WorkerOptions) {
        this.ns = ns;
        this.pool = pool;

        this.threads = options.threads;
        this.mode = options.mode;
        this.target = options.target;

        const reservation = (this.reservation =
            options.useReservation ??
            globalThis.system.memory.reserve(this.pool.workerRam[this.mode] * this.threads, { tag: this.mode })!);

        const [pid, killed] = runScript(
            ns,
            WORKER_SCRIPT_PATH,
            {
                hostname: reservation!.hostname,
                threads: this.threads,
                temporary: true,
                useReservation: options.useReservation,
            },
            "--target",
            this.target,
            "--mode",
            this.mode,
        );
        if (pid === 0) {
            console.warn(`Couldn't start worker: `, this, reservation);
            throw new Error(`Couldn't start ${this}: Failed to start worker script.`);
        }

        this.awaitKilled = killed!.then(() => {
            if (this.pid > 0) this.stop();
        });

        this.pid = pid;
        this.pool.byPids.set(this.pid, this);
        this.pool.free.add(this);
    }

    public get hostname(): string | null {
        if (!this.running) return null;
        return this.reservation.hostname;
    }

    get running() {
        return this.pid > 0;
    }

    /**
     * Kill this Worker's process.
     */
    stop() {
        this.send({
            event: "stop",
            data: {},
        });
        this.pid = 0;
        this.pool.forget(this);

        return this.awaitKilled;
    }

    /**
     * Instructs this worker to execute once.
     * @returns A Promise that resolves when the worker has finished its task.
     */
    public async work(options?: BasicHGWOptions, signal?: AbortSignal) {
        this.send({
            event: "start",
            data: { options },
        });

        try {
            return await this.awaitDone(signal);
        } catch {
            // the only way `awaitDone` can throw is if it's aborted.
            return null;
        }
    }

    #nextDonePromise: null | Promise<WorkResult> = null;
    #nextDoneRes: null | ((result: WorkResult) => void) = null;

    /**
     * Returns a Promise that returns when the Worker finishes its current task.
     */
    private awaitDone(signal?: AbortSignal) {
        if (!this.#nextDonePromise) {
            const { promise, resolve, reject } = Promise.withResolvers<WorkResult>();
            signal?.addEventListener("abort", () => {
                this.send({
                    event: "abort",
                    data: {},
                });
                reject(signal.reason ?? new Error("Aborted."));
            });
            this.#nextDonePromise = promise;
            this.#nextDoneRes = resolve;
        }

        return this.#nextDonePromise;
    }

    /**
     * @param result the worker's reported result.
     */
    done(result: WorkResult) {
        this.#nextDoneRes?.(result);
        this.#nextDonePromise = null;
        this.#nextDoneRes = null;
    }

    /**
     * Send a message to this worker.
     */
    send(message: WorkerMessage) {
        if (!this.running) return;

        this.ns.writePort(WORKER_MESSAGE_PORT_BASE + this.pid, message);
    }
}
