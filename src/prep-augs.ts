import { NS } from "@ns";

const MAX_FAVOR = 35331;

function clamp(n: number, min = 0, max = Infinity) {
    return Math.min(Math.max(n, min), max);
}

function repToFavor(reputation: number) {
    return clamp(
        Math.log(reputation / 25000 + 1) / Math.log(1.02),
        0,
        MAX_FAVOR,
    );
}

function favorToRep(favor: number) {
    return clamp(25000 * (Math.pow(1.02, favor) - 1), 0);
}

export async function main(ns: NS) {
    if (ns.args.some((arg) => typeof arg !== "string")) {
        ns.tprint(
            "ERROR: all arguments need to be strings of the form faction:rep:favor.",
        );
        return;
    }

    for (const arg of ns.args as string[]) {
        const [faction, repString, favorString] = arg.split(":");

        if (!faction || repString === undefined || repString === undefined) {
            return ns.tprint(
                `ERROR: ${arg} expected to be string of format faction:rep:favor`,
            );
        }

        const rep = parseInt(repString);
        if (isNaN(rep))
            return ns.tprint(
                `ERROR: ${faction} rep expected to be integer, was "${repString}" (${typeof repString})`,
            );

        const favor = parseInt(favorString);
        if (isNaN(favor))
            return ns.tprint(
                `ERROR: ${faction} rep expected to be integer, was "${favorString}" (${typeof favorString})`,
            );

        const gain = repToFavor(rep);
        const favorAfter = repToFavor(favorToRep(favor) + rep);

        const favorNeeded = ns.getFavorToDonate() - favorAfter;
        let repNeeded = favorToRep(ns.getFavorToDonate()) - rep;

        let color = favorNeeded > 0 ? "\x1b[31;1m" : "\x1b[36;1m";

        ns.tprint(
            `\x1b[1m${faction}\x1b[0m: ${color}${ns.formatNumber(favorAfter)}\x1b[0m (${ns.formatNumber(repNeeded)} rep needed for donations)`,
        );
    }
}
