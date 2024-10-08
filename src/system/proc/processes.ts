import { NS } from "@ns";
import { info, Reservation } from "../memory";

const PROCESSES = new Set<number>();
const RUN_PROMISES = new Map<number, { promise: Promise<void>; resolve: () => void }>();
const RESERVATIONS = new Map<number, Reservation>();

export function getReservation(ns: NS): Reservation | null;
export function getReservation(pid: number): Reservation | null;
export function getReservation(nsOrPid: NS | number): Reservation | null {
    const pid = typeof nsOrPid === "number" ? nsOrPid : nsOrPid.pid;
    return RESERVATIONS.get(pid) ?? null;
}

/**
 * Report a script as having been started.
 * @param late whether startup of this script was discovered late. This prevents `process:started` from being emitted.
 * @returns a promise that resolves when the corresponding script finishes/is killed.
 */
export function started(pidOrNs: number | NS, late?: boolean): Promise<void> {
    const pid = typeof pidOrNs === "number" ? pidOrNs : pidOrNs.pid;

    if (PROCESSES.has(pid)) {
        return RUN_PROMISES.get(pid)!.promise;
    }

    PROCESSES.add(pid);

    let resolve: () => void = () => {};
    const promise = new Promise<void>((res) => (resolve = res));
    RUN_PROMISES.set(pid, { promise, resolve });

    if (!late) globalThis.eventEmitter.emit("process:started", pid);

    return promise;
}

/**
 * Assign a reservation to a specific PID. If the corresponding script is killed, the reservation is {@link globalThis.system.memory.free |free}'d.
 */
export function assign(pid: number, reservation: Reservation): boolean;
export function assign(ns: NS, reservation: Reservation): boolean;
export function assign(nsOrPid: number | NS, reservation: Reservation): boolean {
    const pid = typeof nsOrPid === "number" ? nsOrPid : nsOrPid.pid;

    if (RESERVATIONS.has(pid)) return false;

    RESERVATIONS.set(pid, reservation);
    globalThis.eventEmitter.emit("process:assigned", pid, info(reservation));
    return true;
}

/**
 * Reports a script as having been killed.
 */
export function killed(ns: NS): void;
export function killed(pid: number): void;
export function killed(pidOrNs: number | NS): void {
    const pid = typeof pidOrNs === "number" ? pidOrNs : pidOrNs.pid;

    PROCESSES.delete(pid);
    RUN_PROMISES.get(pid)?.resolve();
    RUN_PROMISES.delete(pid);
    if (RESERVATIONS.has(pid)) {
        const reservation = RESERVATIONS.get(pid)!;
        globalThis.eventEmitter.emit("process:killed", pid, info(reservation));

        globalThis.system.memory.free(reservation);
        RESERVATIONS.delete(pid);
    } else {
        globalThis.eventEmitter.emit("process:killed", pid);
    }
}

declare global {
    namespace system {
        namespace proc {
            /**
             * Report that a script has started.
             */
            function started(pidOrNs: number | NS): Promise<void>;
            /**
             * Assign a reservation to a script for automatic `free`ing.
             */
            function assign(nsOrPid: number | NS, reservation: Reservation): boolean;
            /**
             * Report that a script has been killed.
             */
            function killed(pidOrNs: number | NS, late?: boolean): void;
            /**
             * List registered processes.
             */
            function running(): number[];

            function getReservation(nsOrPid: number | NS): Reservation | null;
        }
    }
}

export async function load(_: NS, system: typeof globalThis.system) {
    system.proc = {
        started,
        assign: assign as any,
        killed: killed as any,
        running: () => [...PROCESSES],
        getReservation: getReservation as any,
    };
}
