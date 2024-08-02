import { NS } from "@ns";
import { auto } from "/system/proc/auto";
import { sleep } from "/lib/lib";
import { GangSettings } from "./settings";

export async function main(ns: NS) {
    auto(ns, { tag: "gang" });

    const settings = new GangSettings(ns);
    settings.save();

    function getGang(): string | null {
        try {
            const gang = ns.gang.getGangInformation();
            if (!gang) return null;
            return gang.faction;
        } catch {
            return null;
        }
    }

    while (true) {
        await sleep(250, true);
        settings.load();

        if (getGang() !== null) {
            ns.spawn("/gang/gang.js", 1);
            return;
        }

        if (settings.gangFaction) {
            ns.gang.createGang(settings.gangFaction);
        }
    }
}
