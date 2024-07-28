import { NS } from "@ns";
import { getServers } from "/lib/servers/servers";
import { getServerGraph } from "/lib/servers/graph";
import { auto } from "/system/proc/auto";

const SERVERS_TO_BACKDOOR = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "The-Cave", "fulcrumassets"];

export async function main(ns: NS) {
    auto(ns);
    const all = ns.args[0];
    if (all !== undefined && typeof all !== "boolean") {
        ns.tprint(`ERROR: optional argument "all" should be a boolean.`);
    }

    const server = (all ? getServers(ns) : SERVERS_TO_BACKDOOR.map((server) => ns.getServer(server))).filter(
        (server) =>
            server.hostname !== "home" &&
            !server.purchasedByPlayer &&
            !server.backdoorInstalled &&
            server.hasAdminRights,
    )[0];

    if (!server) {
        ns.tprint("No more servers to backdoor.");
        return;
    }

    const path = getServerGraph(ns).path("home", server.hostname);

    if (!path) {
        ns.tprint(`Failed to find path to ${server.hostname}`);
        return;
    }

    navigator.clipboard.writeText(
        ["home", ...path, server.hostname].map((node) => `connect ${node};`).join("") + "backdoor;",
    );
    ns.tprint("Copied backdoor command to clipboard.");
}
