import { NS, Server } from "@ns";
import { SparseArray } from "/lib/lib";

const MEMORY_MAP = new Map<string, MemInfo>();

export function getMemoryMap() {
    return new Map([...MEMORY_MAP].map(([key, info]) => [key, info.clone()]));
}

export type ServerMemInfo = Pick<
    Server,
    "maxRam" | "hostname" | "hasAdminRights"
>;

export class MemInfo {
    public readonly hostname: string;

    private _capacity: number;
    /**
     * Total memory capacity of this server.
     */
    public get capacity() {
        return this._capacity;
    }

    private _hasAdminRights: boolean;
    /**
     * Whether this server is usable for script execution.
     */
    public get usable() {
        return this._hasAdminRights;
    }

    private lastFree: number | null = null;
    /**
     * Free available memory on this server.
     */
    public get available() {
        let free: number;
        if (this.lastFree) {
            free = this.lastFree;
        } else {
            const newFree =
                this.capacity -
                [...this.reservations.values()].reduce(
                    (acc, cur) => acc! + (cur ?? 0),
                    0,
                )!;
            this.lastFree = newFree;
            free = newFree;
        }
        if (free < 0) throw new Error(`Free < 0 for "${this.hostname}".`);
        return free;
    }

    constructor(server: ServerMemInfo) {
        this.hostname = server.hostname;
        this._capacity = server.maxRam;
        this._hasAdminRights = server.hasAdminRights;
    }

    /**
     * Update a server's memory information.
     * @returns whether any changes were made.
     */
    update(server: ServerMemInfo): boolean {
        const oldMax = this.capacity;
        let changed = false;

        this._hasAdminRights = server.hasAdminRights;

        if (this._capacity < server.maxRam) {
            this._capacity = server.maxRam;

            if (this.lastFree !== null) this.lastFree += this.capacity - oldMax;

            changed = true;
        }

        return changed;
    }

    protected reservations = new SparseArray<number>();

    /**
     * Get the size of a reservation.
     */
    reserved(index: number): number | undefined {
        return this.reservations.get(index);
    }

    /**
     * Reserve a chunk.
     */
    reserve(amount: number): number {
        if (this.available < amount) return -1;

        this.lastFree! -= amount;
        return this.reservations.push(amount);
    }

    /**
     * Free a chunk allocation.
     */
    free(chunkIndex: number): boolean {
        const removed = this.reservations.remove(chunkIndex);
        if (removed === undefined) return false;

        this.lastFree = null;
        return true;
    }

    /**
     * Grow a chunk.
     */
    grow(chunkIndex: number, growBy: number): boolean {
        if (this.available < growBy) return false;

        const old = this.reservations.get(chunkIndex);
        if (typeof old !== "number") return false;

        this.reservations.set(chunkIndex, old + growBy);
        this.lastFree! -= growBy;

        return true;
    }

    public clone() {
        const clone = new MemInfo({
            hostname: this.hostname,
            maxRam: this._capacity,
            hasAdminRights: this._hasAdminRights,
        });

        clone.reservations = this.reservations.clone();

        return clone;
    }
}

/**
 * Register a new server to use with {@link reserve}.
 * If the server has already been registered, its info will be updated.
 * @param server Server to register.
 * @returns whether any server info was added or updated.
 */
export function register(server: ServerMemInfo): boolean {
    if (!server.hasAdminRights) return false;

    const hostname = server.hostname;

    if (MEMORY_MAP.has(hostname)) {
        const info = MEMORY_MAP.get(hostname)!;
        return info.update(server);
    }

    const info = new MemInfo(server);
    MEMORY_MAP.set(server.hostname, info);

    return true;
}

export interface Reservation {
    hostname: string;
    chunkIndex: number;
}

/**
 * Reserve `amount` RAM in GB. Yes this is basically a crude `malloc`.
 * To free this allocation again, see {@link free}.
 * @param amount amount of memory (in GB) to reserve.
 * @param onServer server to reserve RAM on. If not set, reserves on the server with the most available memory.
 * @returns the reservation, or `null` if the reservation failed.
 */
export function reserve(amount: number, onServer?: string): Reservation | null {
    if (typeof onServer !== "undefined") {
        const info = MEMORY_MAP.get(onServer);
        if (!info) {
            console.error(
                `Attempt to reserve memory on server that has not been registered.`,
            );
            return null;
        }
        if (!info.usable) return null;
        const chunkIndex = info.reserve(amount);
        if (chunkIndex < 0) return null;

        return { hostname: onServer, chunkIndex };
    } else {
        for (const info of [...MEMORY_MAP.values()]
            .filter((server) => server.usable)
            .sort((a, b) => b.available - a.available)) {
            const chunkIndex = info.reserve(amount);
            if (chunkIndex < 0) continue;

            return { chunkIndex, hostname: info.hostname };
        }

        return null;
    }
}

export function reserveThreads(
    threads: number,
    threadSize: number,
): Reservation[] | null {
    const available = [...MEMORY_MAP.values()].reduce(
        (acc, curr) => acc + curr.available,
        0,
    );

    if (available < threads * threadSize) return null;

    const reservations: Reservation[] = [];

    function cleanup() {
        for (const res of reservations) free(res);
        return null;
    }

    const servers = [...MEMORY_MAP.values()].filter(
        (server) => server.available >= threadSize,
    );

    while (threads > 0 && servers.length > 0) {
        const server = servers.shift()!;

        const freeThreads = Math.floor(server.available / threadSize);
        if (freeThreads <= 0) continue;
        const useThreads = Math.min(freeThreads, threads);

        const reservation = reserve(useThreads * threadSize, server.hostname);

        if (!reservation) {
            console.error(
                `Something be funky: ${threads}, ${threadSize}, ${useThreads}`,
                server,
            );
            return cleanup();
        }

        reservations.push(reservation);
        threads -= useThreads;
    }

    if (threads > 0) {
        const availablePreCleanup = [...MEMORY_MAP.values()].reduce(
            (acc, curr) => acc + curr.available,
            0,
        );
        cleanup();

        const availablePostCleanup = [...MEMORY_MAP.values()].reduce(
            (acc, curr) => acc + curr.available,
            0,
        );

        console.warn(
            `Apparently not enough memory available for ${threads}x${threadSize}GB: ${availablePostCleanup} - ${threads * threadSize} = ${availablePostCleanup - threads * threadSize} | attempted to use ${(((availablePostCleanup - availablePreCleanup) / threads) * threadSize * 100).toFixed(2)}% of available memory.`,
        );
        return null;
    }

    return reservations;
}

function sizeOf(res: Reservation): number | undefined {
    const mem = MEMORY_MAP.get(res.hostname);
    if (!mem) return undefined;

    return mem.reserved(res.chunkIndex);
}

/**
 * Reserve `chunks` sections of memory with size `chunkSize`.
 * @returns the reserved chunks, or `null` if reservation failed.
 */
export function reserveChunks(
    chunks: number,
    chunkSize: number,
): Reservation[] | null {
    const reservations = [];

    for (let i = 0; i < chunks; i++) {
        const reservation = reserve(chunkSize);
        if (!reservation) {
            for (const reservation of reservations) free(reservation);
            return null;
        }

        reservations.push(reservation);
    }

    return reservations;
}

/**
 * Free a `Reservation` from {@link reserve}.
 * @returns whether freeing the allocation was successful.
 */
export function free(reservation: Reservation): boolean {
    const info = MEMORY_MAP.get(reservation.hostname);
    if (!info) return false;
    if (!info.usable) return false;
    return info.free(reservation.chunkIndex);
}

/**
 * Grow a `Reservation` by `amount` GB.
 * @returns whether growing the allocation was successful.
 */
export function grow(reservation: Reservation, amount: number): boolean {
    const info = MEMORY_MAP.get(reservation.hostname);
    if (!info) return false;
    if (!info.usable) return false;
    return info.grow(reservation.chunkIndex, amount);
}

declare global {
    namespace system {
        namespace memory {
            /**
             * Register a new server to use with {@link globalThis.system.memory.reserve | reserve}.
             * If the server has already been registered, its info will be updated.
             * @param server Server to register.
             * @returns whether any server info was added or updated.
             */
            function register(server: ServerMemInfo): boolean;
            /**
             * Reserve `amount` RAM in GB. Yes this is basically a crude `malloc`.
             * To free this allocation again, see {@link globalThis.system.memory.free | free}.
             * @param amount amount of memory (in GB) to reserve.
             * @param onServer server to reserve RAM on. If not set, reserves on the server with the most available memory.
             * @returns the reservation, or `null` if the reservation failed.
             */
            function reserve(
                amount: number,
                onServer?: string,
            ): Reservation | null;
            /**
             * Reserve `chunks` sections of memory with size `chunkSize`.
             * @returns the reserved chunks, or `null` if reservation failed.
             */
            function reserveChunks(
                chunks: number,
                chunkSize: number,
            ): Reservation[] | null;
            /**
             * Free a `Reservation` from {@link globalThis.system.memory.reserve | reserve}.
             * @returns whether freeing the allocation was successful.
             */
            function free(reservation: Reservation): boolean;
            /**
             * Grow a `Reservation` by `amount` GB.
             * @returns whether growing the allocation was successful.
             */
            function grow(reservation: Reservation, amount: number): boolean;
            function sizeOf(reservation: Reservation): number | undefined;
        }
    }
}

export async function load(ns: NS) {
    if (globalThis.system.memory) {
        console.warn(`Overriding old memory configuration.`);
        ns.print(`WARNING: Overriding old memory configuration.`);
    }
    globalThis.system.memory = {
        register,
        reserve,
        reserveChunks,
        free,
        grow,
        sizeOf,
    };
}
