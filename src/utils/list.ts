import { NS } from "@ns";
import { getServers } from "/lib/servers/servers";
import { getPortCrackersAvailable } from "./crackers";

export function autocomplete(data: any, args: any) {
    return ["owned", "unnuked", "weird", "cycle-threads", "unowned"];
}

/**
 * @param { NS } ns
 * @param {string} hostname
 * @param {number} hackRatio how much in % of a target's money to hack in a single cycle.
 */
function calculateBatchRatios(
    ns: NS,
    hostname: string,
    hackRatio: number = 0.35,
) {
    const server = ns.getServer(hostname);

    const hackAmount = (server.moneyAvailable ?? 0) * hackRatio;
    const hackThreads = Math.floor(
        ns.hackAnalyzeThreads(server.hostname, hackAmount),
    );

    if (hackThreads < 0) {
        throw new Error(
            `Invalid hackThreads amount for ${hostname} - ${hackRatio}. Did you prepare the server before calling this?`,
        );
    }

    const hackSecIncrease = ns.hackAnalyzeSecurity(hackThreads);
    const hackWeakenThreads = Math.ceil(hackSecIncrease / 0.05);

    const growThreads = Math.ceil(
        ns.growthAnalyze(server.hostname, 1 / (1 - hackRatio)),
    );
    const growSecIncrease = ns.growthAnalyzeSecurity(growThreads);
    const growWeakenThreads = Math.ceil(growSecIncrease / 0.05);

    return {
        hackThreads,
        hackWeakenThreads,
        growThreads,
        growWeakenThreads,
        get total() {
            return (
                this.hackThreads +
                this.hackWeakenThreads +
                this.growThreads +
                this.growWeakenThreads
            );
        },
    };
}

/** @param {NS} ns */
export async function main(ns: NS) {
    ns.disableLog("scan");
    const mode = ns.args.shift();

    if (mode === "owned") {
        ns.tprint("Listing owned servers with columns free/total/max RAM.");

        const pMax = ns.formatRam(ns.getPurchasedServerMaxRam());
        const hMax = ns.formatRam(2 ** 30);
        for (const server of getServers(ns).filter(
            (server) => server.purchasedByPlayer,
        )) {
            const free = ns.formatRam(server.maxRam - server.ramUsed);
            const max = ns.formatRam(server.maxRam);
            ns.tprint(
                `\x1b[1m${server.hostname}\x1b[0m: ${free}/${max}/${server.hostname === "home" ? hMax : pMax}`,
            );
        }
    } else if (mode === "unnuked") {
        const numPortCrackers = getPortCrackersAvailable(ns);

        const servers = getServers(ns)
            .filter((server) => !server.hasAdminRights)
            .sort(
                (a, b) =>
                    (a.requiredHackingSkill ?? 0) -
                    (b.requiredHackingSkill ?? 0),
            );
        if (servers.length === 0) {
            ns.tprint("No servers left to nuke!");
            return;
        }

        for (const server of servers) {
            const skillString = `${server.requiredHackingSkill}\x1b[0m`;
            const skillPrefix =
                (server.requiredHackingSkill ?? 0) >
                ns.getPlayer().skills.hacking
                    ? `\x1b[31m`
                    : `\x1b[36m`;

            const portsString = `${server.numOpenPortsRequired}\x1b[0m`;
            const portsPrefix =
                (server.numOpenPortsRequired ?? 0) > numPortCrackers
                    ? `\x1b[31m`
                    : `\x1b[36m`;

            ns.tprint(
                `\x1b[1m${server.hostname}\x1b[0m: ${skillPrefix}${skillString} | ${portsPrefix}${portsString}`,
            );
        }
    } else if (mode === "weird") {
        const servers = getServers(ns)
            .filter(
                (server) =>
                    (server.moneyMax ?? 0) <= 0 && !server.purchasedByPlayer,
            )
            .sort(
                (a, b) =>
                    (a.requiredHackingSkill ?? 0) -
                    (b.requiredHackingSkill ?? 0),
            );

        for (const server of servers) {
            const skillString = `${server.requiredHackingSkill}\x1b[0m`;
            const skillPrefix =
                (server.requiredHackingSkill ?? 0) >
                ns.getPlayer().skills.hacking
                    ? `\x1b[31m`
                    : `\x1b[36m`;
            ns.tprint(
                `\x1b[1m${server.hostname}\x1b[0m: ${skillPrefix}${skillString}`,
            );
        }
    } else if (mode === "cycle-threads") {
        const hackRatio = ns.args[0] ?? 0.35;
        if (typeof hackRatio !== "number") {
            ns.tprint(`ERROR: hack ratio must be number.`);
            return;
        }

        ns.tprint(
            `Listing threads needed per cycle on every hackable server, using a hackRatio of ${hackRatio}`,
        );

        for (const server of getServers(ns)
            .filter(
                (server) => server.hasAdminRights && (server.moneyMax ?? 0) > 0,
            )
            .sort(
                (a, b) =>
                    (a.requiredHackingSkill ?? 0) -
                    (b.requiredHackingSkill ?? 0),
            )) {
            const threads = calculateBatchRatios(
                ns,
                server.hostname,
                hackRatio,
            );
            ns.tprint(
                `\x1b[1m${server.hostname}\x1b[0m: Total ${threads.total}. ${threads.hackThreads} hack-, ${threads.growThreads} grow-, ${threads.growWeakenThreads + threads.hackWeakenThreads} (${threads.hackWeakenThreads} hack-, ${threads.growWeakenThreads} grow-) weaken threads.`,
            );
        }
    } else if (mode === "unowned") {
        ns.tprint("Listing owned servers with columns free/total/max RAM.");
        for (const server of getServers(ns).filter(
            (server) => !server.purchasedByPlayer,
        )) {
            const free = ns.formatRam(server.maxRam - server.ramUsed);
            const max = ns.formatRam(server.maxRam);
            ns.tprint(`\x1b[1m${server.hostname}\x1b[0m: ${free}/${max}`);
        }
    }
}
