import { NS } from "@ns";
import { WorkerPool } from "./pool";
import { ServerData } from "/lib/servers/server-cache";
import { HWGWWorkerBatch } from "./workers/batch";
import { findExtremes, sleep } from "/lib/lib";
import { WorkerMode } from "./consts";
import { calcThreads } from "/lib/network-threads";
import { WorkerGroup } from "./workers/group";
import { auto } from "/system/proc/auto";

function checkNetworkMemory() {
    let total = 0;
    for (const server of servers.values()) total += server.maxRam;
    return total;
}

function getAvailableMemory(chunkSize: number) {
    let total = 0;
    for (const server of servers.values()) {
        const available = server.memInfo.available
        if (available > chunkSize) {
            total += available;
        };
    }
    return total;
}


export async function main(ns: NS) {
    auto(ns, { tag: "hacking" });
    ns.disableLog("exec");
    ns.disableLog("sleep");
    ns.disableLog("scan");

    const pool = new WorkerPool(ns);

    const batchManagers = new Map<string, BatchManager>();
    const server = servers.get("the-hub")!;
    const testBatch = new BatchManager(pool, server);
    while (!(await testBatch.prepare())) {
        console.log("Preparing batch....");
        await sleep(250, true);
    };

    let i;
    for (i = 0; i < 2500; i++) {
        const scheduled = testBatch.schedule();
        if (!scheduled) break;
    }

    ns.tprint(`Scheduled ${i} ${server.hostname} batches.`);

    batchManagers.set(server.hostname, testBatch);   
    while (true) {
        await sleep(250);
    }
}

/**
 * Manages HWGW batches for a single server.
 */
class BatchManager {
    private readonly ns: NS;
    private readonly batches = new Set<HWGWWorkerBatch>();

    private workPromises = new Set<Promise<boolean>>();
    
    _target: ServerData;

    public get target() {
        this._target.refetch();
        return this._target;
    }

    constructor(
        private readonly pool: WorkerPool,
        target: ServerData,
    ) {
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

        const growMultiplier = 1 / (Math.max(this.target.moneyAvailable, 1) / this.target.moneyMax);

        const workers: WorkerGroup[] = [];

        const cleanup = () => {
            workers.forEach(worker => worker.stop());
        }

        if (growMultiplier !== 1) {
            const growThreads = Math.min(
                this.ns.growthAnalyze(this.target.hostname, growMultiplier, 1),
                calcThreads(this.pool.workerRam[WorkerMode.Grow]).free
            );

            const grow = this.pool.reserveGroup(growThreads, { mode: WorkerMode.Grow, target: this.target.hostname });
            if (!grow) return false;
            workers.push(grow);
        }

        let weakenThreads = (this.target.hackDifficulty - this.target.baseDifficulty) / 0.05;
        if (workers.length > 0) {
            // *pretty* sure security increase scales linearly with grow threads.
            weakenThreads += workers[0]!.threads / 0.05;
        }

        weakenThreads = Math.min(weakenThreads, calcThreads(this.pool.workerRam[WorkerMode.Weaken]).free);

        if (weakenThreads > 0) {
            const weaken = this.pool.reserveGroup(weakenThreads, { mode: WorkerMode.Weaken, target: this.target.hostname });
            if (!weaken) {
                cleanup();
                return false;
            }

            workers.push(weaken);
        }


        await Promise.all(workers.map(worker => worker.work()));
        cleanup();
        return this.isPrepared();
    }

    /**
     * @returns the minimum amount of cores any single worker in this batch has available to it.
     */
    public minCores() {
        const res = findExtremes([...this.batches].map(batch => [
            batch.hackGroup, batch.growGroup, batch.weakenGrowGroup, batch.weakenHackGroup
        ]).flat().map(group => group.minCores()), cores => cores)!;

        return res?.min ?? 1;
    }

    private calculateHackRatio(_iterations = 25): number {
        // TODO: Actually implement.
        return 0.95;
    }

    /**
     * Schedule a new cycle to run in parallel with all other current cycles.
     * @returns whether the cycle was scheduled.
     */
    public schedule(): boolean {
        const hackRatio = this.calculateHackRatio();

        const { 
            hackThreads, growThreads, 
            growWeakenThreads, hackWeakenThreads
        } = this.pool.calculateBatchRatios(this.target.hostname, hackRatio);

        const groups: WorkerGroup[] = [];
        const cleanup = () => {
            groups.forEach(group => group.stop());
            return false;
        }

        const hackGroup = this.pool.reserveGroup(hackThreads, { mode: WorkerMode.Hack, target: this.target.hostname });
        if (!hackGroup) return cleanup();
        groups.push(hackGroup);

        const growGroup = this.pool.reserveGroup(growThreads, { mode: WorkerMode.Grow, target: this.target.hostname });
        if (!growGroup) return cleanup();
        groups.push(growGroup);

        const weakenGrowGroup = this.pool.reserveGroup(growWeakenThreads, { mode: WorkerMode.Weaken, target: this.target.hostname });
        if (!weakenGrowGroup) return cleanup();
        groups.push(weakenGrowGroup);

        const weakenHackGroup = this.pool.reserveGroup(hackWeakenThreads, { mode: WorkerMode.Weaken, target: this.target.hostname });
        if (!weakenHackGroup) return cleanup();
        groups.push(weakenHackGroup);

        const batch = new HWGWWorkerBatch(this.ns, this.target.hostname, weakenGrowGroup, weakenHackGroup, growGroup, hackGroup)
        this.batches.add(batch);

        this.workPromises.add(batch.runContinuously());
        
        return true;
    }

    /**
     * Whether the server is currently prepared.
     */
    public isPrepared(): boolean {
        const { 
            hackDifficulty, minDifficulty,
            moneyAvailable, moneyMax
        } = this.target;

        return (moneyAvailable === moneyMax && hackDifficulty === minDifficulty);
    }

    /**
     * Kill every workers on this manager.
     */
    public stop(): void {
        this.batches.forEach(batch => batch.stop());
        this.batches.clear();
    }
}