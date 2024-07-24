import { NS } from "@ns";
import { getServerGraph } from "/lib/servers/graph";

export function autocomplete(data: any, args: any) {
    return [...data.servers];
}

export async function main(ns: NS) {
    const to = ns.args[0];
    if (!to || typeof to !== "string" || !ns.serverExists(to)) {
        ns.tprint(`ERROR No such server: ${to}`);
        return;
    }

    const from = ns.args[1] ?? ns.getHostname();
    if (typeof from !== "string") {
        ns.tprint(`ERROR No such server: ${to}`);
        return;
    }

    if (!ns.serverExists(from)) {
        ns.tprint(`ERROR No such server: ${from}`);
    }

    const path = getServerGraph(ns).path(to, from)?.reverse();

    if (!path) {
        ns.tprint(`Couldn't find path from ${from} to ${to}.`);
        return;
    }

    ns.tprint("Found path:");
    ns.tprint(
        [`\x1b[1m${from}\x1b[0m`, ...path, `\x1b[1m${to}\x1b[0m`].join(" => ")
    );
    ns.tprint("Copied connection string to clipboard.");
    navigator.clipboard.writeText(
        [...path, to].map((node) => `connect ${node}`).join(";"),
    );
}
