import { NS } from "@ns";
import { auto } from "/system/proc/auto";

export async function main(ns: NS) {
    auto(ns, { tag: "gang" });
    while (true) {
        await ns.asleep(5000);

        try {
            const gang = ns.gang.getGangInformation();
            if (!gang) continue;

            ns.toast(`Gang with ${gang.faction} detected. Starting manager.`);
            ns.spawn("gangs/gang.js", { spawnDelay: 0 });
        } catch {}
    }
}
