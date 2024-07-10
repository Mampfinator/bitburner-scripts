import { NS } from "@ns";

export async function main(ns: NS) {
    ns.tprint(`Karma: ${ns.getPlayer().karma}`);
    ns.tprint(`Killed: ${ns.getPlayer().numPeopleKilled}`);
}
