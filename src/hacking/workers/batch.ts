import { NS } from "@ns";
import { WorkerGroup } from "./group";
import { EventEmitter } from "/system/events";
import { assertFinishedInOrder, OrderError } from "/lib/lib";

export const DELAY = 50;

/**
 * Rethrow `OrderError`s with a human-readable message.
 */
function rethrowOrderError(...names: string[]): (error: any) => never {
    return (error: any) => {
        if (!(error instanceof OrderError)) throw error;

        throw new Error(`
            ${names[error.b.index]} finished before ${names[error.a.index]}: ${Number(error.a.finishedAt) - Number(error.b.finishedAt)}ms.
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
    /**
     * Cached metadata about the last started `work` call.
     * Guaranteed to be non-null after the `started` event is emitted.
     */
    public get metadata() {
        return structuredClone(this._metadata);
    }

    private _metadata: { timing: BatchTiming } | null = null;

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
    async work(signal?: AbortSignal): Promise<number | null> {
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

        const timing = {
            hackDelay, 
            growDelay, 
            hackWeakenDelay, 
            growWeakenDelay,
            growTime: growTime + growDelay,
            hackTime: hackTime + hackDelay,
            hackWeakenTime: weakenTime + hackWeakenDelay,
            growWeakenTime: weakenTime + growWeakenDelay,
        }

        this._metadata = { timing };

        await this.emit("started", timing);

        const results = await assertFinishedInOrder(
            assertFinishedInOrder(
                this.hackGroup.work({ additionalMsec: hackDelay }, signal),
                this.weakenHackGroup.work({ additionalMsec: hackWeakenDelay }, signal),
            ).catch(rethrowOrderError("hack", "weakenHack")),
            assertFinishedInOrder(
                this.growGroup.work({ additionalMsec: growDelay }, signal),
                this.weakenGrowGroup.work({ additionalMsec: growWeakenDelay }, signal),
            ).catch(rethrowOrderError("grow", "weakenGrow")),
        ).catch(rethrowOrderError("hack", "grow"));

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

    /**
     * Run this batch continuously.
     * 
     * @param signal optional AbortSignal.
     */
    async runContinuously(signal?: AbortSignal) {
        while (this.runnable) {
            const result = await this.work(signal);
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
