import { NS } from "@ns";

export const PORT_CRACKERS = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];

export function getPortCrackersAvailable(ns: NS) {
    let n = 0;
    for (const cracker of PORT_CRACKERS) n += Number(ns.fileExists(cracker, "home"));
    return n;
}
