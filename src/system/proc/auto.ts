import { NS } from "@ns";
import { reserve } from "../memory";
import { assign, killed } from "./processes";

/**
 * Set up a script for automatic management.
 */
export function auto(ns: NS, ramOverride?: number) {
    const reservation = reserve(
        ramOverride ?? ns.getScriptRam(ns.getScriptName()),
    );
    if (!reservation)
        throw new Error(
            "Failed to reserve memory for automatic process management.",
        );

    assign(ns, reservation);

    ns.atExit(() => {
        killed(ns);
    }, "clear-reservation");
}
