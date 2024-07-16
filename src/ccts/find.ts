//! Lists all available contracts from all servers.
import { NS } from "@ns";
import { getServerNames } from "/lib/servers/names";

/**
 * Finds all CCTs from all servers. Returns a list of `[hostname, filename]` pairs.
 * @returns {}
 */
export function findCcts(ns: NS): [string, string][] {
    const contracts: [string, string][] = [];

    for (const server of getServerNames(ns, "home")) {
        const results = ns.ls(server, ".cct");

        if (results.length === 0) continue;

        for (const result of results) {
            contracts.push([server, result]);
        }
    }

    return contracts;
}

export async function main(ns: NS) {
    for (const [hostname, filename] of findCcts(ns)) {
        const type = ns.codingcontract.getContractType(filename, hostname);

        ns.tprint(`${hostname}: ${filename} (${type})`);
    }
}
