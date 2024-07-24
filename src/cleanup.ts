import { NS } from "@ns";
import { auto } from "system/proc/auto";

export async function main(ns: NS) {
    auto(ns);

    for (const file of ns.ls(ns.getHostname(), ".js")) {
        ns.rm(file);
    }
}
