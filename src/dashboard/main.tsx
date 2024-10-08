import { NS } from "@ns";
import { SystemDashboard } from "./dashboard";
import { MessageBus } from "/lib/messages";
import { auto } from "/system/proc/auto";
import { sleep } from "/lib/lib";

const { React } = globalThis;

export async function main(ns: NS) {
    auto(ns);
    ns.disableLog("ALL");
    ns.clearLog();

    const messageBus = new MessageBus();

    ns.tail();
    ns.resizeTail(1000, 600);

    ns.printRaw(<SystemDashboard ns={ns} messageBus={messageBus} />);

    while (true) {
        await sleep(50000, true);
    }
}
