import { NS } from "@ns";
import { getServerNames } from "../lib/servers/names";
import { auto } from "/system/proc/auto";

export async function main(ns: NS) {
    auto(ns);
    let searchString = ns.args[0];
    if (typeof searchString === "undefined") {
        ns.tprint(`ERROR: search term needs to be a string.`);
        return;
    }

    if (typeof searchString !== "string") searchString = String(searchString);

    const servers = [];
    for (const server of getServerNames(ns)) {
        if (server.includes(searchString)) {
            servers.push(server);
        }
    }

    for (const server of servers) {
        ns.tprint(server);
    }
}
