import { NS } from "@ns";

export async function main(ns: NS) {
    ns.atExit(() => {
        globalThis.system.proc.killed(ns);
    });

    while (true) {
        await ns.share();
    }
}
