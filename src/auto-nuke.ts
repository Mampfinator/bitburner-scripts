import { NS } from "@ns";
import { register } from "./system/memory";
import { getServerNames } from "./lib/servers/names";

const PORT_CRACKERS: [string, (ns: NS, target: string) => void][] = [
    ["BruteSSH.exe", (ns, target) => ns.brutessh(target)],
    ["FTPCrack.exe", (ns, target) => ns.ftpcrack(target)],
    ["relaySMTP.exe", (ns, target) => ns.relaysmtp(target)],
    ["HTTPWorm.exe", (ns, target) => ns.httpworm(target)],
    ["SQLInject.exe", (ns, target) => ns.sqlinject(target)],
];

export async function main(ns: NS) {
    while (true) {
        const crackers = new Map(PORT_CRACKERS);

        for (const key of crackers.keys()) {
            if (!ns.fileExists(key)) crackers.delete(key);
        }

        const availablePortCrackers = crackers.size;

        const servers = getServerNames(ns);
        const pendingServers = servers.filter(
            (server) =>
                !ns.hasRootAccess(server) &&
                ns.getServerRequiredHackingLevel(server) <=
                    ns.getHackingLevel() &&
                ns.getServerNumPortsRequired(server) <= availablePortCrackers,
        );

        for (const server of pendingServers) {
            ns.toast(`Nuking ${server}.`, "info");

            for (const crackPort of crackers.values()) {
                crackPort(ns, server);
            }

            ns.nuke(server);
            register({
                hostname: server,
                maxRam: ns.getServerMaxRam(server),
                hasAdminRights: true,
            });
        }

        await ns.sleep(10000);
    }
}
