import { NS } from "@ns";
import { WorkerMode } from "./consts";
import { WorkerPool } from "./pool";
import { Worker } from "./worker";

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
