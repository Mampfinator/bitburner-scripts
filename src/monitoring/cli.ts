import { NS } from "@ns";
import { MONITORING_PORT } from "monitoring/monitor";
import { auto } from "/system/proc/auto";

export async function main(ns: NS) {
    auto(ns, { tag: "hacking" });
    const event = ns.args[0];

    if (event === "add" || event === "remove") {
        const target = ns.args[1];
        if (!target) throw new Error(`Must specify a target to watch.`);

        ns.writePort(MONITORING_PORT, { event, data: { target } });
    } else if (event === "reset") {
        ns.writePort(MONITORING_PORT, { event, data: {} });
    }
}
