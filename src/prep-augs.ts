import { NS } from "@ns";
import { auto } from "./system/proc/auto";

function clamp(n: number, min = 0, max = Infinity) {
    return Math.min(Math.max(n, min), max);
}

function favorToRep(favor: number) {
    return clamp(25000 * (Math.pow(1.02, favor) - 1), 0);
}

export async function main(ns: NS) {
    auto(ns);
    const player = ns.getPlayer();

    for (const faction of player.factions) {
        const rep = ns.singularity.getFactionRep(faction);
        const favor = ns.singularity.getFactionFavor(faction);

        const favorGain = ns.singularity.getFactionFavorGain(faction);
        const favorAfter = favor + favorGain;

        const favorNeeded = ns.getFavorToDonate() - favorAfter;

        const repNeeded = favorToRep(ns.getFavorToDonate()) - rep;
        const color = favorNeeded > 0 ? "\x1b[31;1m" : "\x1b[36;1m";

        ns.tprint(
            `\x1b[1m${faction}\x1b[0m: ${color}${ns.formatNumber(favorAfter)}\x1b[0m (${ns.formatNumber(repNeeded)} rep needed for donations)`,
        );
    }
}
