import { BasicHGWOptions, NS } from "@ns";
import { WORKER_MESSAGE_PORT_BASE, WORKER_SCRIPT_PATH, WorkerMessage, WorkerMode } from "../consts";
import { WorkerPool } from "../pool";
import { run as runScript } from "../../system/proc/run";
import { Reservation } from "/system/memory";
import { EventEmitter } from "/system/events";

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

type WorkerEvents = {
    done: (result: WorkResult) => void;
    stopped: () => void;
}

/**
 * Represents a remote instance of `hacking/worker.js`.
 */
export class Worker extends EventEmitter<WorkerEvents> {
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
        super();

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
        }).finally(() => {
            this.emit("stopped");
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
    public async stop() {
        this.send({
            event: "stop",
        });
        this.pid = 0;
        this.pool.forget(this);

        await this.awaitKilled;
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
                });
                reject(signal.reason ?? new Error("Aborted."));
            });
            this.#nextDonePromise = promise
                .then(result => {
                    this.emit("done", result);
                    return result;
                })
                .finally(() => {
                    this.#nextDonePromise = null;
                    this.#nextDoneRes = null;
                });
                
            this.#nextDoneRes = resolve;
        }

        return this.#nextDonePromise;
    }

    /**
     * @param result the worker's reported result.
     */
    done(result: WorkResult) {
        this.#nextDoneRes?.(result);
    }

    /**
     * Send a message to this worker.
     */
    send(message: WorkerMessage) {
        if (!this.running) return;

        this.ns.writePort(WORKER_MESSAGE_PORT_BASE + this.pid, message);
    }
}
