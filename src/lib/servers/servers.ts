import { NS } from "@ns";
import { getServerNames } from "./names";

/**
 * Lists all servers reachable by scanning, starting from `startFrom`.
 *
 * @param {NS} ns
 * @param {string} startFrom
 *
 * @returns {Server[]}
 */
export function getServers(ns: NS, startFrom: string = "home") {
    const hostnames = getServerNames(ns, startFrom);
    return [...hostnames].map((name) => ns.getServer(name));
}
