import { BasicHGWOptions, NS } from "@ns";
import { WorkerMode } from "../consts";
import { WorkerPool } from "../pool";
import { Worker, WorkResult } from "./worker";
import { findExtremes } from "/lib/lib";

export class WorkerGroup {
    workers: Set<Worker>;
    ns: NS;
    pool: WorkerPool;
    mode: WorkerMode;

    [Symbol.toPrimitive]() {
        return `WorkerGroup(${[...this.workers.values()].map((w) => w.pid).join()})`;
    }

    constructor(workers: Set<Worker>) {
        if (workers.size <= 0) throw new Error(`Invalid Worker set for WorkerGroup.`);

        const mode = [...workers.values()][0].mode;
        this.mode = mode;

        this.workers = workers;

        if (workers.size <= 0) throw new Error(`Invalid Worker set for WorkerGroup.`);

        const example = this.workers.values().next()!;
        this.ns = example.value.ns;
        this.pool = example.value.pool;
    }

    get threads() {
        return [...this.workers].reduce((acc, worker) => acc + worker.threads, 0);
    }

    get ram() {
        return this.threads * this.pool.workerRam[this.mode];
    }

    /**
     * @returns the minimum cores any worker in this group has available to it.
     */
    minCores(): number {
        const { min } = findExtremes(
            [...this.workers].map((worker) => globalThis.servers.get(worker.hostname!)!),
            (server) => server.cpuCores,
        )!;
        return min.cpuCores;
    }

    /**
     * @returns {Promise<boolean>}
     */
    async work(options?: BasicHGWOptions): Promise<null | WorkResult[]> {
        const result = await Promise.allSettled([...this.workers.values()].map((worker) => worker.work(options)));

        // if any single worker failed starting, we abort here and free all workers.
        if (result.some((res) => res.status === "rejected" || res.value === null)) {
            for (const worker of this.workers) {
                worker.stop();
            }

            return null;
        }

        return result.map((res) => (res as PromiseFulfilledResult<WorkResult>).value);
    }

    async nextDone() {
        const results = await Promise.all([...this.workers].map((worker) => worker.awaitDone()));
        return {
            target: results[0].target,
            mode: results[0].mode,
            result: results.reduce((acc, { result }) => acc + result, 0),
        };
    }

    stop() {
        for (const worker of this.workers) {
            worker.stop();
        }
    }
}
