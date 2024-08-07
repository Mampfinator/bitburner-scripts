import { NS } from "@ns";

export function getServerNames(ns: NS, startFrom = "home") {
    const hostnames = new Set([startFrom]);

    for (const hostname of hostnames) {
        for (const neighbor of ns.scan(hostname)) {
            hostnames.add(neighbor);
        }
    }

    return [...hostnames];
}
