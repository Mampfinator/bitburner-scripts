import { NS } from "@ns";

export function autocomplete(data: any, args: any) {
    return [...data.servers];
}

function getMultiplier(threads: number) {
    const mult = 1 + Math.log(threads) / 25;
    if (isNaN(mult) || !isFinite(mult)) return 1;
    return mult;
}

/**
 * @param {NS} ns
 */
export async function main(ns: NS) {
    const servers = new Set(ns.args as string[]);

    for (const server of servers) {
        if (!ns.serverExists(server)) {
            servers.delete(server);
            ns.tprint(
                `WARNING: No server called \x1b[1m${server}\x1b[0m. Ignoring.`,
            );
            continue;
        }

        if (!ns.hasRootAccess(server)) {
            servers.delete(server);
            ns.tprint(
                `WARNING: \x1b[1m${server}\x1b[0m exists, but we don't have root access, so we can't run scripts on it. Ignoring.`,
            );
        }
    }

    if (servers.size === 0) {
        ns.tprint(`ERROR: No valid servers specified. Aborting.`);
        return;
    }

    const pids: number[] = [];
    ns.atExit(() => {
        for (const pid of pids) {
            ns.kill(pid);
        }
    });

    for (const server of servers) {
        ns.scp("share.js", server);
    }

    let totalThreads = 0;

    const workerCost = ns.getScriptRam("share.js");

    for (const server of servers) {
        const usableRam =
            ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        const threads = Math.floor(usableRam / workerCost);

        const pid = ns.exec("share.js", server, { threads, temporary: true });
        if (pid === 0) {
            ns.tprint(`ERROR: Failed to launch share.js on ${server}.`);
            continue;
        }

        pids.push(pid);
        totalThreads += threads;
    }

    const bonusGain = getMultiplier(totalThreads) - 1;

    ns.tprint(
        `Running \x1b[36;1m${totalThreads}\x1b[0m (\x1b[36m${ns.formatRam(totalThreads * workerCost)}\x1b[0m) share threads across \x1b[1m${servers.size}\x1b[0m servers for a rep gain bonus of \x1b[36;1m${ns.formatPercent(bonusGain)}\x1b[0m.`,
    );

    while (true) {
        await ns.sleep(1000);
    }
}
