import { NS } from "@ns";
import { auto } from "/system/proc/auto";

export async function main(ns: NS) {
    auto(ns);
    ns.tprint(`Karma: ${ns.getPlayer().karma}`);
    ns.tprint(`Killed: ${ns.getPlayer().numPeopleKilled}`);
}
