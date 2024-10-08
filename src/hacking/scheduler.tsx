import { NS } from "@ns";
import { WorkerPool } from "./pool";
import { ServerData } from "/lib/servers/server-cache";
import { HWGWWorkerBatch } from "./workers/batch";
import { findExtremes, randomString, sleep } from "/lib/lib";
import { WorkerMode } from "./consts";
import { calcThreads } from "/lib/network-threads";
import { WorkerGroup } from "./workers/group";
import { auto } from "/system/proc/auto";
import { EventEmitter } from "/system/events";
import { BatchManagerView } from "./components/BatchManager";

const { React } = globalThis;

function rateServer(server: ServerData) {
    return (Math.pow(server.moneyMax, 1.5) / server.minDifficulty) * Math.log(server.serverGrowth);
}

function calculateFreeNetworkRam(): number {
    return [...servers.values()].map(server => server.memInfo?.available ?? 0).reduce((a, b) => a + b, 0);
}

export async function main(ns: NS) {
    auto(ns, { tag: "hacking" });
    ns.disableLog("ALL");
    ns.clearLog();

    const pool = new WorkerPool(ns);
    let manager: BatchManager | undefined = undefined;

    let oldScore = 0;


    while (true) {
        const freeRam = calculateFreeNetworkRam();

        const targets = [...globalThis.servers.values()]
            .filter(s => !s.purchasedByPlayer && s.moneyMax > 0 && s.requiredHackingSkill <= ns.getHackingLevel())
            .filter(s => pool.calculateBatchRatios(s.hostname, 0.25).totalRam <= freeRam)
            .sort((a, b) => rateServer(b) - rateServer(a));

        const target = targets[0];
        const score = rateServer(target);

        if (
            (!manager || manager.target.hostname !== target.hostname) && 
            // only switch targets if the new target is significantly better than the current one, since prepare() is expensive.
            (oldScore * 1.1 < score)
        ) {
            ns.clearLog();
            await (manager as BatchManager)?.stop();

            manager = new BatchManager(pool, target);
            ns.printRaw(<BatchManagerView manager={manager} />);
            await manager.prepare();
            oldScore = score;
        } else {
            oldScore = score;
        }

        if (!manager) throw new Error(`No manager!`);

        const prepared = await manager.prepare();
        if (prepared) {
            let scheduled = true;
            while (scheduled) {
                scheduled = await manager.schedule();
                // give the game some breathing room.
                await sleep(500, true);
            }
        }
        await sleep(1000, true);
    }
}

type BatchManagerEvents = {
    "scheduled": (batch: HWGWWorkerBatch, id: string) => void;
}

/**
 * Manages HWGW batches for a single server.
 */
export class BatchManager extends EventEmitter<BatchManagerEvents> {
    private readonly ns: NS;
    public readonly batches = new Map<string, HWGWWorkerBatch>();

    private workPromises = new Set<Promise<boolean>>();

    readonly _target: ServerData;

    public get target() {
        this._target.refetch();
        return this._target;
    }

    constructor(
        private readonly pool: WorkerPool,
        target: ServerData,
    ) {
        super();

        if (target.moneyMax === 0) throw new Error(`Invalid server for hacking.`);
        this._target = target;
        this.ns = pool.ns;
    }

    /**
     * Prepare a server for being cycled.
     * @returns whether the server has been prepared.
     * This should only ever return false when we're operating in a thread-starved environment.
     */
    public async prepare(): Promise<boolean> {
        if (this.isPrepared()) return true;

        const workers: WorkerGroup[] = [];

        const cleanup = () => {
            workers.forEach((worker) => worker.stop());
        };

        const weakenThreads = Math.min(
            (this.target.hackDifficulty - this.target.minDifficulty) / 0.05,
            calcThreads(this.pool.workerRam[WorkerMode.Weaken]).free,
        );

        if (weakenThreads > 0) {
            const weaken = this.pool.reserveGroup(weakenThreads, {
                mode: WorkerMode.Weaken,
                target: this.target.hostname,
            });

            if (weaken) {
                workers.push(weaken);
            }
        }

        const growMultiplier = 1 / (Math.max(this.target.moneyAvailable, 1) / this.target.moneyMax);
        if (growMultiplier !== 1) {
            const analyzed = Math.ceil(this.ns.growthAnalyze(this.target.hostname, growMultiplier));
            const free = Math.floor(calcThreads(this.pool.workerRam[WorkerMode.Grow]).free * 0.5);

            const growThreads = Math.min(analyzed, free);

            const grow = this.pool.reserveGroup(growThreads, { mode: WorkerMode.Grow, target: this.target.hostname });
            if (grow) {
                workers.push(grow);

                const growSecIncrease = this.ns.growthAnalyzeSecurity(growThreads);
                const weakenThreads = Math.min(
                    Math.floor(growSecIncrease / 0.05),
                    calcThreads(this.pool.workerRam[WorkerMode.Weaken]).free,
                );
                const weaken = this.pool.reserveGroup(weakenThreads, {
                    mode: WorkerMode.Weaken,
                    target: this.target.hostname,
                });

                if (weaken) workers.push(weaken);
            }
        }

        await Promise.all(workers.map((worker) => worker.work()));
        cleanup();
        return this.isPrepared();
    }

    /**
     * @returns the minimum amount of cores any single worker in this batch has available to it.
     */
    public minCores() {
        const res = findExtremes(
            [...this.batches.values()]
                .map((batch) => [batch.hackGroup, batch.growGroup, batch.weakenGrowGroup, batch.weakenHackGroup])
                .flat()
                .map((group) => group.minCores()),
            (cores) => cores,
        )!;

        return res?.min ?? 1;
    }

    private calculateHackRatio(_iterations = 25): number {
        // TODO: Actually implement.
        return 0.25;
    }

    /**
     * Schedule a new cycle to run in parallel with all other current cycles.
     * @returns whether the cycle was scheduled.
     */
    public async schedule(): Promise<boolean> {
        const hackRatio = this.calculateHackRatio();

        const { hackThreads, growThreads, growWeakenThreads, hackWeakenThreads } = this.pool.calculateBatchRatios(
            this.target.hostname,
            hackRatio,
        );

        const groups: WorkerGroup[] = [];
        const cleanup = () => {
            groups.forEach((group) => group.stop());
            return false;
        };

        const hackGroup = this.pool.reserveGroup(hackThreads, { mode: WorkerMode.Hack, target: this.target.hostname });
        if (!hackGroup) return cleanup();
        groups.push(hackGroup);

        const growGroup = this.pool.reserveGroup(growThreads, { mode: WorkerMode.Grow, target: this.target.hostname });
        if (!growGroup) return cleanup();
        groups.push(growGroup);

        const weakenGrowGroup = this.pool.reserveGroup(growWeakenThreads, {
            mode: WorkerMode.Weaken,
            target: this.target.hostname,
        });
        if (!weakenGrowGroup) return cleanup();
        groups.push(weakenGrowGroup);

        const weakenHackGroup = this.pool.reserveGroup(hackWeakenThreads, {
            mode: WorkerMode.Weaken,
            target: this.target.hostname,
        });
        if (!weakenHackGroup) return cleanup();
        groups.push(weakenHackGroup);

        const batch = new HWGWWorkerBatch(
            this.ns,
            this.target.hostname,
            weakenGrowGroup,
            weakenHackGroup,
            growGroup,
            hackGroup,
        );

        const id = randomString(7)

        this.batches.set(id, batch);

        await this.emit("scheduled", batch, id);

        this.workPromises.add(batch.runContinuously());

        return true;
    }

    /**
     * Whether the server is currently prepared.
     */
    public isPrepared(): boolean {
        const { hackDifficulty, minDifficulty, moneyAvailable, moneyMax } = this.target;

        return moneyAvailable === moneyMax && hackDifficulty === minDifficulty;
    }

    /**
     * Kill every workers on this manager.
     */
    public stop(): void {
        this.batches.forEach((batch) => batch.stop());
        this.batches.clear();
    }
}
