import { NS } from "@ns";
import { register } from "./system/memory";
import { auto } from "./system/proc/auto";
import { getServerGraph } from "./lib/servers/graph";

const PORT_CRACKERS: [string, (ns: NS, target: string) => void][] = [
    ["BruteSSH.exe", (ns, target) => ns.brutessh(target)],
    ["FTPCrack.exe", (ns, target) => ns.ftpcrack(target)],
    ["relaySMTP.exe", (ns, target) => ns.relaysmtp(target)],
    ["HTTPWorm.exe", (ns, target) => ns.httpworm(target)],
    ["SQLInject.exe", (ns, target) => ns.sqlinject(target)],
];

async function doBackdoor(
    ns: NS,
    server: string,
    graph?: ReturnType<typeof getServerGraph>,
): Promise<boolean> {
    const { singularity } = ns;
    const startedAt = singularity.getCurrentServer();

    if (!graph) graph = getServerGraph(ns, { startFrom: startedAt });

    const path = graph.path(startedAt, server);
    if (!path) return false;

    const walked = [startedAt];

    while (path.length > 0) {
        const server = path.shift()!;

        const success = singularity.connect(server);

        if (success) {
            walked.unshift(server);
        } else {
            const message = `Unable to connect from "${singularity.getCurrentServer()}" to ${server}.`;
            ns.print(`ERROR: ${message}`);
            console.warn(message, path, graph);
            // walk back the path we came from to recover initial terminal state.
            for (const server of walked) singularity.connect(server);
            return false;
        }
    }

    singularity.connect(server);
    try {
        await singularity.installBackdoor();
        graph.addEdge(startedAt, server);
        for (const server of walked) singularity.connect(server);
        return true;
    } catch (e) {
        console.error(`Failed to backdoor ${server}.`, e);
        for (const server of walked) singularity.connect(server);
        return false;
    }
}

async function catchup(ns: NS) {
    const { singularity } = ns;

    const original = singularity.getCurrentServer();

    singularity.connect("home");

    const graph = getServerGraph(ns);

    for (const server of [...graph.nodes]
        .map((server) => ns.getServer(server))
        .filter(
            (server) => server.hasAdminRights && !server.backdoorInstalled,
        )) {
        await doBackdoor(ns, server.hostname, graph);
    }

    if (original === "home") return;

    const path = graph.path("home", original);
    if (!path) return;
    for (const server of path) singularity.connect(server);
    singularity.connect(original);
}

export async function main(ns: NS) {
    auto(ns);

    await catchup(ns);

    while (true) {
        const crackers = new Map(PORT_CRACKERS);
        const missingCrackers = new Set<string>();

        for (const key of crackers.keys()) {
            if (!ns.fileExists(key)) {
                crackers.delete(key);
                missingCrackers.add(key);
            }
        }

        if (ns.singularity.purchaseTor())
            for (const cracker of missingCrackers) {
                ns.singularity.purchaseProgram(cracker);
            }

        const availablePortCrackers = crackers.size;
        const hackingSkill = ns.getHackingLevel();

        const graph = getServerGraph(ns);

        for (const server of [...graph.nodes]
            .map((server) => ns.getServer(server))
            .filter(
                (server) =>
                    !server.hasAdminRights &&
                    (server.requiredHackingSkill ?? 0) <= hackingSkill &&
                    (server.numOpenPortsRequired ?? 0) <= availablePortCrackers,
            )) {
            if (!server.hasAdminRights) {
                ns.toast(`Nuking ${server}.`, "info");

                for (const [_, crack] of crackers) crack(ns, server.hostname);

                try {
                    ns.nuke(server.hostname);
                } catch {
                    console.warn(
                        `Port cracker mismatch. Expected to have ${availablePortCrackers} >= ${server.numOpenPortsRequired}.`,
                    );
                    continue;
                }
                register({
                    hostname: server.hostname,
                    maxRam: ns.getServerMaxRam(server.hostname),
                    hasAdminRights: true,
                });
            }

            if (!server.backdoorInstalled)
                await doBackdoor(ns, server.hostname, graph);
        }

        await ns.sleep(10000);
    }
}
