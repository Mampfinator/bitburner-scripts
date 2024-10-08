import { NS, Server } from "@ns";
import { SparseArray } from "/lib/lib";

const MEMORY_MAP = new Map<string, MemInfo>();

export function getMemoryMap() {
    return new Map([...MEMORY_MAP].map(([key, info]) => [key, info.clone()]));
}

export type ServerMemInfo = Pick<Server, "maxRam" | "hostname" | "hasAdminRights">;

interface InternalReservation {
    amount: number;
    tag?: string;
}

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

    /**
     * Caches how much memory was last available.
     *
     * Not meant to be taken as ground truth. Use `MemInfo#available` instead.
     */
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
                this.capacity - [...this.reservations.values()].reduce((acc, cur) => acc! + (cur?.amount ?? 0), 0)!;
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
     *
     * @fires global#server:rooted
     * @fires global#server:ram-updated
     */
    update(server: ServerMemInfo): boolean {
        let changed = false;

        if (this._hasAdminRights != server.hasAdminRights) {
            this._hasAdminRights = server.hasAdminRights;
            changed = true;

            /**
             * @event global#server:rooted
             * @type { string } the hostname of the newly-rooted server.
             */
            globalThis.eventEmitter.emit(`server:rooted`, server.hostname);
        }

        if (this._capacity != server.maxRam) {
            /**
             * @event global#server:ram-updated
             * @type {object}
             * @property {string} hostname
             * @property {number} newRam
             * @property {number} oldRam
             */
            globalThis.eventEmitter.emit(`server:ram-upgraded`, {
                hostname: this.hostname,
                newRam: server.maxRam,
                oldRam: this._capacity,
            });

            if (this.lastFree !== null) this.lastFree += server.maxRam - this.capacity;
            this._capacity = server.maxRam;

            changed = true;
        }

        return changed;
    }

    protected reservations = new SparseArray<InternalReservation>();

    /**
     * Get the size of a reservation.
     */
    reserved(index: number): number | undefined {
        return this.reservations.get(index)?.amount;
    }

    /**
     * Reserve a chunk.
     */
    reserve(amount: number, tag?: string): number {
        if (this.available < amount) return -1;

        this.lastFree! -= amount;
        return this.reservations.push({ amount, tag });
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
    growChunk(chunkIndex: number, growBy: number): boolean {
        if (this.available < growBy) return false;

        const old = this.reservations.get(chunkIndex);
        if (!old) return false;

        old.amount += growBy;
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

    public details(chunkIndex: number): ReservationDetails | null {
        const reservation = this.reservations.get(chunkIndex);
        if (!reservation) return null;

        return {
            hostname: this.hostname,
            chunkIndex,
            ...reservation,
        };
    }

    public list(): ReservationDetails[] {
        return [...this.reservations.entries()]
            .filter((e) => !!e[1])
            .map(([chunkIndex, reservation]) => ({
                hostname: this.hostname,
                chunkIndex,
                ...reservation!,
            })) as ReservationDetails[];
    }
}

export interface ReservationDetails extends InternalReservation {
    hostname: string;
    chunkIndex: number;
}

/**
 * Register a new server to use with {@link reserve}.
 * If the server has already been registered, its info will be updated.
 * @param server Server to register.
 * @returns whether any server info was added or updated.
 *
 * @fires global#server:rooted
 * @fires global#server:ram-updated
 * @fires global#server:added
 */
export function register(server: ServerMemInfo): [true, MemInfo] | [false, MemInfo | null] {
    const hostname = server.hostname;

    if (MEMORY_MAP.has(hostname)) {
        const info = MEMORY_MAP.get(hostname)!;
        const updated = info.update(server);
        return [updated, info];
    }

    const info = new MemInfo(server);
    MEMORY_MAP.set(server.hostname, info);
    /**
     * @event global#server:added
     * @type {string}
     */
    globalThis.eventEmitter.emit(`server:added`, server.hostname);

    return [true, info];
}

export interface Reservation {
    hostname: string;
    chunkIndex: number;
}

interface ReserveOptions {
    onServer?: string;
    tag?: string;
}

/**
 * Reserve `amount` RAM in GB. Yes this is basically a crude `malloc`.
 * To free this allocation again, see {@link free}.
 * @param amount amount of memory (in GB) to reserve.
 * @returns the reservation, or `null` if the reservation failed.
 */
export function reserve(amount: number, options?: ReserveOptions): Reservation | null {
    const { onServer, tag } = options ?? {};
    if (typeof onServer !== "undefined") {
        const info = MEMORY_MAP.get(onServer);
        if (!info) {
            console.error(`Attempt to reserve memory on server that has not been registered.`);
            return null;
        }
        if (!info.usable) return null;
        const chunkIndex = info.reserve(amount, tag);
        if (chunkIndex < 0) return null;

        return { hostname: onServer, chunkIndex };
    } else {
        for (const info of [...MEMORY_MAP.values()]
            .filter((server) => server.usable)
            .sort((a, b) => b.available - a.available)) {
            const chunkIndex = info.reserve(amount, tag);
            if (chunkIndex < 0) continue;

            return { chunkIndex, hostname: info.hostname };
        }

        return null;
    }
}

export enum ReserveThreadsError {
    OutOfMemory = "The network is out of memory.",
    ReservationFailed = "A thought-good reservation failed.",
    UnexpectedOutOfMemory = "The network is out of memory, but it shouldn't have been.",
}

export const OK = "Ok";

export function reserveThreads(
    threads: number,
    threadSize: number,
    tag?: string,
): { result: ReserveThreadsError; reservations: null } | { result: typeof OK; reservations: Reservation[] } {
    // fractional threads are not (yet) supported.
    threads = Math.ceil(threads);

    const available = [...MEMORY_MAP.values()].reduce((acc, curr) => {
        if (!curr.usable) return acc;
        return acc + Math.floor(curr.available / threadSize);
    }, 0);

    if (available < threads) {
        return { result: ReserveThreadsError.OutOfMemory, reservations: null };
    }

    const pendingReservations: { hostname: string; amount: number }[] = [];

    function cleanup(errorCode: ReserveThreadsError) {
        return { result: errorCode, reservations: null };
    }

    const servers = [...MEMORY_MAP.values()]
        .filter((server) => server.usable && server.available >= threadSize)
        .sort((a, b) => b.available - a.available);

    while (threads > 0 && servers.length > 0) {
        const server = servers.shift()!;

        const freeThreads = Math.floor(server.available / threadSize);
        if (freeThreads <= 0) continue;
        const useThreads = Math.min(freeThreads, threads);

        pendingReservations.push({
            hostname: server.hostname,
            amount: useThreads * threadSize,
        });
        threads -= useThreads;
    }

    if (threads > 0) {
        const availablePreCleanup = [...MEMORY_MAP.values()].reduce((acc, curr) => acc + curr.available, 0);
        const res = cleanup(ReserveThreadsError.OutOfMemory);

        const availablePostCleanup = [...MEMORY_MAP.values()].reduce((acc, curr) => acc + curr.available, 0);

        console.warn(
            `Apparently not enough memory available for ${threads}x${threadSize}GB: ${availablePostCleanup} - ${threads * threadSize} = ${availablePostCleanup - threads * threadSize} | attempted to use ${(((availablePostCleanup - availablePreCleanup) / threads) * threadSize * 100).toFixed(2)}% of available memory.`,
        );
        return res;
    }

    const reservations: Reservation[] = [];
    for (const { hostname, amount } of pendingReservations) {
        const reservation = reserve(amount, { onServer: hostname, tag });
        if (!reservation) {
            for (const res of reservations) free(res);
            return cleanup(ReserveThreadsError.ReservationFailed);
        }

        reservations.push(reservation);
    }

    return { reservations, result: OK };
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
export function reserveChunks(chunks: number, chunkSize: number): Reservation[] | null {
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
export function growChunk(reservation: Reservation, amount: number): boolean {
    const info = MEMORY_MAP.get(reservation.hostname);
    if (!info) return false;
    if (!info.usable) return false;
    return info.growChunk(reservation.chunkIndex, amount);
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
            function register(server: ServerMemInfo): [true, MemInfo] | [false, MemInfo | null];
            /**
             * Reserve `amount` RAM in GB. Yes this is basically a crude `malloc`.
             * To free this allocation again, see {@link globalThis.system.memory.free | free}.
             * @param amount amount of memory (in GB) to reserve.
             * @param onServer server to reserve RAM on. If not set, reserves on the server with the most available memory.
             * @returns the reservation, or `null` if the reservation failed.
             */
            function reserve(amount: number, options?: ReserveOptions): Reservation | null;
            /**
             * Reserve `chunks` sections of memory with size `chunkSize`.
             * @returns the reserved chunks, or `null` if reservation failed.
             */
            function reserveChunks(chunks: number, chunkSize: number, tag?: string): Reservation[] | null;
            /**
             * Free a `Reservation` from {@link globalThis.system.memory.reserve | reserve}.
             * @returns whether freeing the allocation was successful.
             */
            function free(reservation: Reservation): boolean;
            /**
             * Grow a `Reservation` by `amount` GB.
             * @returns whether growing the allocation was successful.
             */
            function growChunk(reservation: Reservation, amount: number): boolean;
            function sizeOf(reservation: Reservation): number | undefined;
            function list(server: string): ReservationDetails[] | null;
            function info(reservation: Reservation): ReservationDetails | null;
        }
    }
}

export function list(server: string): ReservationDetails[] | null {
    const info = MEMORY_MAP.get(server);
    if (!info) return null;
    return info.list();
}

export function info(reservation: Reservation): ReservationDetails | null {
    const info = MEMORY_MAP.get(reservation.hostname);
    if (!info) return null;

    return info.details(reservation.chunkIndex);
}

export async function load(ns: NS, system: typeof globalThis.system) {
    if (globalThis.system?.memory) {
        console.warn(`Overriding old memory configuration.`);
        ns.print(`WARNING: Overriding old memory configuration.`);
    }

    system.memory = {
        register,
        reserve,
        reserveChunks,
        free,
        growChunk,
        sizeOf,
        list,
        info,
    };
}
