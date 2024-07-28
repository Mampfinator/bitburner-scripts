import { NS, Server } from "@ns";
import { getServerGraph, ServerGraph } from "/lib/servers/graph";
import { connect } from "/lib/servers/connect";

function canBackdoor(server: Server): boolean {
    return server.hasAdminRights;
}

function isBackdoored(server: Server): boolean {
    // Owned servers have this `undefined`.
    return server.backdoorInstalled ?? true;
}

async function backdoor(
    ns: NS,
    server: string,
    graph?: ReturnType<typeof getServerGraph>,
): Promise<boolean> {
    const { singularity } = ns;
    const startedAt = singularity.getCurrentServer();

    const [connected, goBack] = connect(ns, server, graph);
    if (!connected) return false;

    try {
        await singularity.installBackdoor();
        graph?.addEdge(startedAt, server);
        goBack();
        return true;
    } catch (e) {
        console.error(`Failed to backdoor ${server}.`, e);
        goBack();
        return false;
    }
}

function canNuke(server: Server, ns: NS): boolean {
    return ns.getHackingLevel() >= (server.requiredHackingSkill ?? 0);
}

function isNuked(server: Server): boolean {
    return server.hasAdminRights;
}

const PORT_CRACKERS: ((ns: NS, target: string) => void)[] = [
    (ns, target) => ns.brutessh(target),
    (ns, target) => ns.ftpcrack(target),
    (ns, target) => ns.relaysmtp(target),
    (ns, target) => ns.httpworm(target),
    (ns, target) => ns.sqlinject(target),
];

// we
async function nuke(server: Server, ns: NS) {
    for (const crack of PORT_CRACKERS) {
        try {
            crack(ns, server.hostname);
        } catch {}
    }

    try {
        ns.nuke(server.hostname);
    } catch {}
}

/**
 * Process a server. Returns whether the server has been fully processed now.
 * If true, server will be excluded from future calls.
 */
export async function processServer(
    server: Server,
    ns: NS,
    serverGraph: ServerGraph,
): Promise<boolean> {
    if (!isNuked(server) && canNuke(server, ns)) {
        await nuke(server, ns);
    }

    if (!isBackdoored(server) && canBackdoor(server)) {
        await backdoor(ns, server.hostname, serverGraph);
    }

    return isNuked(server) && isBackdoored(server);
}
