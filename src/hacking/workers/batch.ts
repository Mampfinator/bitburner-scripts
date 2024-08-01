import { NS } from "@ns";
import { WorkerGroup } from "./group";

export const DELAY = 200;

/**
 * A `Hack->Weaken->Grow->Weaken` worker batch.
 */
export class HWGWWorkerBatch {
    constructor(
        public readonly ns: NS,
        public readonly target: string,
        public readonly weakenGrowGroup: WorkerGroup,
        public readonly weakenHackGroup: WorkerGroup,
        public readonly growGroup: WorkerGroup,
        public readonly hackGroup: WorkerGroup,
    ) {}

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

        this.weakenHackGroup.work();

        let hackPromise = this.ns.asleep(weakenTime - hackTime - DELAY).then(() => this.hackGroup.work());

        await this.ns.asleep(DELAY);

        await this.weakenGrowGroup.work();
        let growPromise = this.ns.asleep(weakenTime - growTime - DELAY).then(() => this.growGroup.work());

        await Promise.all([hackPromise, growPromise]);

        let hackingDone = false;
        let growingDone = false;

        const [hackResult] = await Promise.all([
            this.hackGroup.nextDone().then((res) => {
                hackingDone = true;
                return res;
            }),
            this.growGroup.nextDone().then((res) => {
                growingDone = true;
                return res;
            }),
            this.weakenHackGroup.nextDone().then((res) => {
                if (!hackingDone)
                    /*this.ns.toast(
                        `${this.target}: Weaken Hack finished before hacking completed.`,
                        "error",
                        null,
                    );*/
                    return res;
            }),
            this.weakenGrowGroup.nextDone().then((res) => {
                if (!growingDone)
                    /*this.ns.toast(
                        `${this.target}: Weaken Grow finished before growing completed.`,
                        "error",
                        null,
                    );*/
                    return res;
            }),
        ]);

        return hackResult.result;
    }

    async runContinuously() {
        while (this.runnable) {
            const result = await this.work();
            if (result === null) return false;
        }

        return true;
    }

    getDoneTime() {
        return this.ns.getWeakenTime(this.target) + 3 * DELAY;
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
