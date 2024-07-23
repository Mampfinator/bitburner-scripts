import { NS } from "@ns";
import { WORKER_MESSAGE_PORT, WORKER_SCRIPTS, WorkerMode } from "./consts";
import { WorkerPool } from "./pool";
import { run } from "../../system/proc/processes";
import { Reservation } from "/system/memory";

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

    [Symbol.toPrimitive]() {
        return `Worker(${this.isRunning ? this.pid : "DEAD"}:${this.mode}=>${this.target})`;
    }

    constructor(ns: NS, pool: WorkerPool, options: WorkerOptions) {
        this.ns = ns;
        this.pool = pool;

        this.threads = options.threads;
        this.mode = options.mode;
        this.target = options.target;

        const scriptPath = WORKER_SCRIPTS[this.mode];
        const [pid, killed] = run(ns, scriptPath, {
            threads: this.threads,
            temporary: true,
            useReservation: options.useReservation,
        });

        if (pid === 0) {
            throw new Error(
                `Couldn't start ${this}: Failed to start worker.js.`,
            );
        }

        this.pid = pid;
        this.pool.byPids.set(this.pid, this);
        this.pool.free.add(this);
    }

    get isRunning() {
        return this.pid > 0;
    }

    /**
     * Kill this Worker's process.
     */
    kill() {
        this.ns.kill(this.pid);
        this.pid = 0;
        this.pool.forget(this);
    }

    /**
     * Instructs this worker to execute once.
     * @returns A Promise that resolves when the worker has finished its task.
     */
    work() {
        this.send("start", {
            autoContinue: false,
        });

        return this.awaitDone();
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
    awaitDone() {
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
        if (!this.isRunning) return;

        this.ns.writePort(WORKER_MESSAGE_PORT + this.pid, {
            event,
            pid: this.pid,
            data,
        });
    }
}
