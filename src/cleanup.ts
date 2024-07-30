//! Delete every single script on all servers.
//! Used mainly for re-syncing with the game-external folder state because bitburner-sync is weird.
import { NS } from "@ns";
import { getServerNames } from "./lib/servers/names";

export async function main(ns: NS) {
    for (const server of getServerNames(ns)) {
        for (const file of ns.ls(server, ".js")) {
            ns.rm(file);
        }
    }
}
