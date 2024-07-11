import { NS } from "@ns";
import { WorkerGroup } from "./group";
import { WorkerMode } from "./consts";

export const DELAY = 200;

/**
 * A `Hack->Weaken->Grow->Weaken` worker batch.
 */
export class HWGWWorkerBatch {
    constructor(
        private readonly ns: NS,
        private readonly target: string,
        private readonly weakenGrow: WorkerGroup,
        private readonly weakenHack: WorkerGroup,
        private readonly grow: WorkerGroup,
        private readonly hack: WorkerGroup,
    ) {}

    /**
     * Runs this batch once.
     * @returns the amount of money stolen, or null if the batch failed to run.
     */
    async run(): Promise<number | null> {
        if (!this.runnable) {
            this.ns.tprint(
                `Failed to start batch for ${this.target}. ${this.hack ? "Hack exists" : "Hack is null"} : ${this.grow ? "Grow exists" : "Grow is null"}.`,
            );
            return null;
        }

        let startedAt = Date.now();

        const hackTime = this.ns.getHackTime(this.target);
        const weakenTime = this.ns.getWeakenTime(this.target);
        const growTime = this.ns.getGrowTime(this.target);

        this.weakenHack.start(this.target, WorkerMode.Weaken);

        let hackPromise = this.ns
            .asleep(weakenTime - hackTime - DELAY)
            .then(() => this.hack.start(this.target, WorkerMode.Hack));

        await this.ns.asleep(DELAY);

        await this.weakenGrow.start(this.target, WorkerMode.Weaken);
        let growPromise = this.ns
            .asleep(weakenTime - growTime - DELAY)
            .then(() => this.grow.start(this.target, WorkerMode.Grow));

        await Promise.all([hackPromise, growPromise]);

        let hackingDone = false;
        let growingDone = false;

        const [hackResult] = await Promise.all([
            this.hack.nextDone().then((res) => {
                hackingDone = true;
                return res;
            }),
            this.grow.nextDone().then((res) => {
                growingDone = true;
                return res;
            }),
            this.weakenHack.nextDone().then((res) => {
                //if (!hackingDone) this.ns.toast(`${this.target}: Weaken Hack finished before hacking completed.`, "error", null);
                return res;
            }),
            this.weakenGrow.nextDone().then((res) => {
                //if (!growingDone) this.ns.toast(`${this.target}: Weaken Grow finished before growing completed.`, "error", null);
                return res;
            }),
        ]);

        return hackResult.result;
    }

    async altRun() {
        if (!this.runnable) {
            this.ns.tprint(
                `Failed to start batch for ${this.target}. ${this.hack ? "Hack exists" : "Hack is null"} : ${this.grow ? "Grow exists" : "Grow is null"}.`,
            );
            return null;
        }

        const hackTime = this.ns.getHackTime(this.target);
        const weakenTime = this.ns.getWeakenTime(this.target);
        const growTime = this.ns.getGrowTime(this.target);
        const startedAt = Date.now();

        let hackFinishedAt: number;
        let weakenHFinishedAt: number;
        let growFinishedAt: number;
        let weakenGFinishedAt: number;

        const donePromises = [
            this.hack.nextDone().then(() => {
                hackFinishedAt = Date.now();
                console.log(
                    `Hack workers finished at ${(hackFinishedAt - startedAt).toFixed(2)}ms.`,
                );
            }),
            this.weakenHack.nextDone().then(() => {
                weakenHFinishedAt = Date.now();
                console.log(
                    `WeakenH workers finished at ${(weakenHFinishedAt - startedAt).toFixed(2)}ms`,
                );
            }),
            this.grow.nextDone().then(() => {
                growFinishedAt = Date.now();
                console.log(
                    `Grow workers finished at ${(growFinishedAt - startedAt).toFixed(2)}ms`,
                );
            }),
            this.weakenGrow.nextDone().then(() => {
                weakenGFinishedAt = Date.now();
                console.log(
                    `WeakenG workers finished at ${(weakenGFinishedAt - startedAt).toFixed(2)}ms`,
                );
            }),
        ];

        this.ns.print(`Starting workers for ${this.target}.`);

        await this.weakenHack
            .start(this.target, WorkerMode.Weaken)
            .then((r) => {
                console.log(
                    `Starting weaken hack workers took ${Date.now() - startedAt}ms.`,
                );
                return r;
            });

        const finishHackAt = weakenTime - DELAY;
        const startHackDelay = finishHackAt - hackTime;

        const hackPromise = this.ns.asleep(startHackDelay).then(async () => {
            const before = Date.now();
            const r = await this.hack.start(this.target, WorkerMode.Hack);
            console.log(`Starting hack workers took ${Date.now() - before}ms`);
            return r;
        });

        const finishGrowAt = finishHackAt + DELAY;
        const startGrowDelay = finishGrowAt - growTime;
        const growPromise = this.ns.asleep(startGrowDelay).then(async () => {
            const before = Date.now();
            const r = await this.grow.start(this.target, WorkerMode.Grow);
            console.log(`Starting grow workers took ${Date.now() - before}ms`);
            return r;
        });

        const finishGrowWeakenAt = finishGrowAt + DELAY;
        const startGrowWeakenDelay = finishGrowWeakenAt - growTime;
        const growWeakenPromise = this.ns
            .asleep(startGrowWeakenDelay)
            .then(async () => {
                const before = Date.now();
                const sec = this.ns.getServerSecurityLevel(this.target);
                const t = this.ns.getWeakenTime(this.target);
                console.log(
                    `Grow weaken: started with ${sec} (${this.ns.getServerMinSecurityLevel(this.target)}) security. Expected to take ${t}ms (${weakenTime}ms).`,
                );
                const r = await this.weakenGrow.start(
                    this.target,
                    WorkerMode.Weaken,
                );
                console.log(
                    `Starting weaken grow workers took ${Date.now() - before}ms`,
                );
                return r;
            });

        await Promise.all([hackPromise, growPromise, growWeakenPromise]);

        const hackResultPromise = this.hack.nextDone();

        await Promise.all(donePromises);

        console.log(
            [
                [
                    "weakenH",
                    weakenHFinishedAt! - startedAt,
                    weakenTime,
                ] as const,
                ["hack", hackFinishedAt! - startedAt, finishHackAt] as const,
                ["grow", growFinishedAt! - startedAt, finishGrowAt] as const,
                [
                    "weakenG",
                    weakenGFinishedAt! - startedAt,
                    finishGrowWeakenAt,
                ] as const,
            ].sort(([, a], [, b]) => a - b),
        );

        const { result } = await hackResultPromise;
        return result;
    }

    getDoneTime() {
        return this.ns.getWeakenTime(this.target) + 3 * DELAY;
    }

    get runnable() {
        return (
            this.weakenGrow !== null &&
            this.weakenHack !== null &&
            this.hack !== null &&
            this.grow !== null
        );
    }

    /**
     * Kill every worker in this batch. Effectively makes this worker unusable.
     */
    kill() {
        this.weakenGrow?.kill();
        this.weakenHack?.kill();
        this.hack?.kill();
        this.grow?.kill();
    }
}
