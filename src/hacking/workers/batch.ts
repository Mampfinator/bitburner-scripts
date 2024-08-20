import { NS } from "@ns";
import { WorkerGroup } from "./group";
import { formatTime } from "/lib/lib";
import { EventEmitter } from "/system/events";

export const DELAY = 50;

class OrderError<T> extends Error {
    constructor(
        public readonly a: { index: number; finishedAt: Date; result: T },
        public readonly b: { index: number; finishedAt: Date; result: T },
    ) {
        super(`Promise ${b.index} finished before ${a.index}: ${Number(a.finishedAt)} < ${Number(b.finishedAt)}`);
    }
}

/**
 * Assert that all promises finish in the order they're specified.
 * This waits for all Promises to resolve *before* computing the result.
 *
 * @throws An `OrderError` if the promises finish in the wrong order.
 */
async function assertFinishedInOrder<T>(...promises: Promise<T>[]): Promise<T[]> {
    if (promises.length <= 1) return Promise.all(promises); 

    const withTimestamp = promises.map((p) => p.then((result) => ({ finishedAt: new Date(), result })));

    let { finishedAt } = await withTimestamp[0];

    for (let i = 1; i < withTimestamp.length; i++) {
        const current = await withTimestamp[i];
        if (current.finishedAt < finishedAt) throw new OrderError<T>({ ...(await withTimestamp[i - 1]), index: i - 1 }, { ...current, index: i });
        finishedAt = current.finishedAt;
    }

    return Promise.all(promises);
}

/**
 * Rethrow `OrderError`s with a human-readable message.
 */
function rethrowOrder(nameA: string, nameB: string): (error: any) => never {
    return (error: any) => {
        if (!(error instanceof OrderError)) throw error;

        throw new Error(`
            ${nameB} finished before ${nameA}: ${Number(error.a.finishedAt) - Number(error.b.finishedAt)}ms.
        `);
    };
}

interface BatchTiming {
    hackDelay: number;
    growDelay: number;
    hackWeakenDelay: number;
    growWeakenDelay: number;

    hackTime: number;
    growTime: number;
    hackWeakenTime: number;
    growWeakenTime: number;
}

export type HWGWWorkerBatchEvents = {
    started: (timing: BatchTiming) => void;
    done: (gained: number) => void;
    error: (error: any) => void;
}

/**
 * A `Hack->Weaken->Grow->Weaken` worker batch.
 */
export class HWGWWorkerBatch extends EventEmitter<HWGWWorkerBatchEvents> {
    constructor(
        public readonly ns: NS,
        public readonly target: string,
        public readonly weakenGrowGroup: WorkerGroup,
        public readonly weakenHackGroup: WorkerGroup,
        public readonly growGroup: WorkerGroup,
        public readonly hackGroup: WorkerGroup,
    ) {
        super();
    }

    /**
     * Runs this batch once.
     * @returns the amount of money stolen, or null if the batch failed to run.
     */
    async work(): Promise<number | null> {
        if (!this.runnable) {
            this.ns.tprint(
                `Failed to start batch for ${this.target}. ${this.hackGroup ? "Hack exists" : "Hack is null"} : ${this.growGroup ? "Grow exists" : "Grow is null"}.`,
            );
            return null;
        }

        const hackTime = this.ns.getHackTime(this.target);
        const weakenTime = this.ns.getWeakenTime(this.target);
        const growTime = this.ns.getGrowTime(this.target);

        const hackDelay = Math.max(weakenTime - (hackTime + DELAY), DELAY);
        const hackWeakenDelay = 0;
        const growDelay = weakenTime - growTime + DELAY;
        const growWeakenDelay = 0 + 2 * DELAY;

        if (hackTime > growTime) {
            throw new Error(`hackTime > growTime not implemented.`);
        }

        this.emit("started", {
            hackDelay, 
            growDelay, 
            hackWeakenDelay, 
            growWeakenDelay,
            growTime: growTime + growDelay,
            hackTime: hackTime + hackDelay,
            hackWeakenTime: weakenTime + hackWeakenDelay,
            growWeakenTime: weakenTime + growWeakenDelay,
        });

        const results = await assertFinishedInOrder(
            assertFinishedInOrder(
                this.hackGroup.work({ additionalMsec: hackDelay }),
                this.weakenHackGroup.work({ additionalMsec: hackWeakenDelay }),
            ).catch(rethrowOrder("hack", "weakenHack")),
            assertFinishedInOrder(
                this.growGroup.work({ additionalMsec: growDelay }),
                this.weakenGrowGroup.work({ additionalMsec: growWeakenDelay }),
            ).catch(rethrowOrder("grow", "weakenGrow")),
        ).catch(rethrowOrder("hack", "grow"));

        if (results === null) {
            return null;
        }

        const hackResult = results[0][1];
        if (hackResult === null) {
            return null;
        }

        const gained = hackResult.reduce((acc, result) => acc + result.result, 0);

        this.emit("done", gained);

        return gained;
    }

    async runContinuously() {
        while (this.runnable) {
            const result = await this.work();
            if (result === null) return false;
        }

        return true;
    }

    get runnable() {
        return !!this.weakenGrowGroup && !!this.weakenHackGroup && !!this.hackGroup && !!this.growGroup;
    }

    /**
     * Kill every worker in this batch. Effectively makes this worker unusable.
     * Also deletes the groups from the batch.
     */
    stop() {
        this.weakenGrowGroup?.stop();
        Reflect.deleteProperty(this, "weakenGrowGroup");
        this.weakenHackGroup?.stop();
        Reflect.deleteProperty(this, "weakenHackGroup");
        this.hackGroup?.stop();
        Reflect.deleteProperty(this, "hackGroup");
        this.growGroup?.stop();
        Reflect.deleteProperty(this, "growGroup");
    }
}
