import { NS } from "@ns";
import { getServers } from "/lib/servers/servers";
import { WorkerPool } from "./workers/pool";
import { getServerNames } from "/lib/servers/names";
// FIXME: make work
// TODO: use system/processes#run for automatic memory management.

function getPossibleTargetServers(ns: NS) {
    return getServers(ns).filter(
        (server) => server.hasAdminRights && (server.moneyMax ?? 0) > 0,
    );
}

const WORKER_FILES = [
    "hacking/worker-scripts/grow.js",
    "hacking/worker-scripts/hack.js",
    "hacking/worker-scripts/weaken.js"
];

function copyFiles(ns: NS) {
    for (const server of getServerNames(ns)) {
        ns.scp(WORKER_FILES, server);
    }
}

const DELAY = 30000;

export async function main(ns: NS) {
    ns.disableLog("ALL");

    copyFiles(ns);
    const pool = new WorkerPool(ns);
}
