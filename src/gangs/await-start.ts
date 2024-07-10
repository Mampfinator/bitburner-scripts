import { NS } from "@ns";

export async function main(ns: NS) {
    while (true) {
        await ns.asleep(5000);

        const gang = ns.gang.getGangInformation();
        if (!gang) continue;

        ns.toast(`Gang with ${gang.faction} detected. Starting manager.`);
        ns.spawn("gangs/gang.js", { spawnDelay: 0 });
    }
}
