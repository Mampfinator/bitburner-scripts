import { NS } from "@ns";
import { getServers } from "./lib/servers/servers";

const PORT_CRACKERS: [string, (ns: NS, target: string) => void][] = [
    ["BruteSSH.exe", (ns, target) => ns.brutessh(target)],
    ["FTPCrack.exe", (ns, target) => ns.ftpcrack(target)],
    ["relaySMTP.exe", (ns, target) => ns.relaysmtp(target)],
    ["HTTPWorm.exe", (ns, target) => ns.httpworm(target)],
    ["SQLInject.exe", (ns, target) => ns.sqlinject(target)],
];

/** @param {NS} ns */
export async function main(ns: NS) {
    while (true) {
        const crackers = new Map(PORT_CRACKERS);

        for (const key of crackers.keys()) {
            if (!ns.fileExists(key)) crackers.delete(key);
        }

        const availablePortCrackers = crackers.size;

        const servers = getServers(ns);
        const pendingServers = servers.filter(
            (server) =>
                !server.hasAdminRights &&
                (server.requiredHackingSkill ?? 0) <= ns.getHackingLevel() &&
                (server.numOpenPortsRequired ?? 0) <= availablePortCrackers,
        );

        for (const server of pendingServers) {
            ns.toast(`Nuking ${server.hostname}.`, "info");

            for (const crackPort of crackers.values()) {
                crackPort(ns, server.hostname);
            }

            ns.nuke(server.hostname);
        }

        await ns.sleep(10000);
    }
}
