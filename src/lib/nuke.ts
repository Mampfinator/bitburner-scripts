import { NS } from "@ns";

export const PORT_CRACKERS: Record<string, (ns: NS, target: string) => void> = {
    "BruteSSH.exe": (ns, target) => ns.brutessh(target),
    "FTPCrack.exe": (ns, target) => ns.ftpcrack(target),
    "relaySMTP.exe": (ns, target) => ns.relaysmtp(target),
    "HTTPWorm.exe": (ns, target) => ns.httpworm(target),
    "SQLInject.exe": (ns, target) => ns.sqlinject(target),
};

export function prepareNuke(ns: NS, target: string) {
    for (const openPort of Object.values(PORT_CRACKERS)) {
        try {
            openPort(ns, target);
        } catch {}
    }
}
