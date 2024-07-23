import { NS, RunOptions as BaseRunOptions, ScriptArg } from "@ns";
import { Reservation } from "../memory";
import { assign, started } from "./processes";

interface RunOptions extends BaseRunOptions {
    hostname?: string;
    useReservation?: Reservation;
}

/**
 * Run a script. This automatically manages Reservations via {@link globalThis.system.memory.reserve | reserve} and subsequent `free`-ing as well.
 * For optimal performance, scripts started this way should add
 * ```ts
 * ns.atExit(() => {
 *  gloablThis.system.proc.killed(ns);
 * })
 * ```
 * to them. A check for killed programs is performed every 50ms otherwise.
 * @returns the script's PID, and a Promise that resolves when the script exists or null if the script couldn't start.
 */
export function run(
    ns: NS,
    scriptPath: string,
    options: RunOptions,
    ...args: ScriptArg[]
): [number, Promise<void>, Reservation] | [0, null, null] {
    const cost =
        options.ramOverride ?? ns.getScriptRam(scriptPath, options.hostname);
    const hostname = options.hostname;

    let reservation;
    if (options.useReservation) {
        reservation = options.useReservation;
    } else {
        reservation = globalThis.system.memory.reserve(cost, hostname);
    }

    if (!reservation) return [0, null, null];

    const pid = ns.run(scriptPath, options, ...args);

    if (pid <= 0) {
        globalThis.system.memory.free(reservation);
        return [0, null, null];
    }

    assign(pid, reservation);
    return [pid, started(pid), reservation];
}
