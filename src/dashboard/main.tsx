import { NS } from "@ns";
import { SystemDashboard } from "./dashboard";
import { MessageBus } from "/lib/messages";

const { React } = globalThis;

export async function main(ns: NS) {
    ns.disableLog("ALL");
    ns.clearLog();

    const messageBus = new MessageBus();

    ns.tail();
    ns.resizeTail(1000, 600);

    ns.printRaw(<SystemDashboard ns={ns} messageBus={messageBus} />);

    while (true) {
        await ns.asleep(50000);
    }
}
