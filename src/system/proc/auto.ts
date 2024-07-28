import { NS } from "@ns";
import { Reservation, reserve } from "../memory";
import { assign, getReservation, killed } from "./processes";

interface AutoOptions {
    useReservation?: Reservation;
    ramOverride?: number;
    tag?: string;
}

/**
 * Set up a script for automatic management.
 */
export function auto(ns: NS, options?: AutoOptions) {
    const { useReservation, ramOverride, tag } = options ?? {};

    if (!getReservation(ns)) {
        const reservation =
            useReservation ??
            reserve(ramOverride ?? ns.getScriptRam(ns.getScriptName()), {
                tag,
            });
        if (!reservation) {
            throw new Error("Failed to reserve memory for automatic process management.");
        }

        assign(ns, reservation);
    }

    ns.atExit(() => {
        killed(ns);
    }, "clear-reservation");
}
