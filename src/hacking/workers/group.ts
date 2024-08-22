import { BasicHGWOptions, NS } from "@ns";
import { WorkerMode } from "../consts";
import { WorkerPool } from "../pool";
import { Worker, WorkResult } from "./worker";
import { findExtremes } from "/lib/lib";
import { EventEmitter } from "/system/events";

function allWorkSuccess(res: PromiseSettledResult<WorkResult | null>[]): res is PromiseFulfilledResult<WorkResult>[] {
    return res.every(isWorkSuccess);
}   

function isWorkSuccess(res: PromiseSettledResult<WorkResult | null>): res is PromiseFulfilledResult<WorkResult> {
    return res.status === "fulfilled" && res.value !== null;
}

export type WorkerGroupEvents = {
    done: (result: WorkResult[]) => void;
    stopped: () => void;
}

export class WorkerGroup extends EventEmitter<WorkerGroupEvents> {
    workers: Set<Worker>;
    ns: NS;
    pool: WorkerPool;
    mode: WorkerMode;

    [Symbol.toPrimitive]() {
        return `WorkerGroup(${[...this.workers.values()].map((w) => w.pid).join()})`;
    }

    constructor(workers: Set<Worker>) {
        super();

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
    async work(options?: BasicHGWOptions, signal?: AbortSignal): Promise<null | WorkResult[]> {
        const result = await Promise.allSettled([...this.workers.values()].map((worker) => worker.work(options, signal)));

        // if any single worker failed starting, we abort here and free all workers.
        // TODO: do not stop workers if we aborted. this would probably require making `WorkResult` a union of some description.
        if (!allWorkSuccess(result)) {
            await this.stop();
            return null;
        }

        const results = result.map((res) => res.value);
        this.emit("done", results);
        return results;
    }

    async stop() {
        await Promise.all([...this.workers.values()].map((worker) => worker.stop()));
        this.emit("stopped");
    }
}
