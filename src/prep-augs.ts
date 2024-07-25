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
