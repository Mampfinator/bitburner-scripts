import { NS } from "@ns";
import { SERVER_NODE_STYLE } from "./ServerNode";
import { apply } from "/system/dependencies";
import { auto } from "/system/proc/auto";
import { SERVER_MENU_STYLE } from "./ServerMenu";
import { ServerTree } from "./ServerTree";

const { React } = globalThis;

export async function main(ns: NS) {
    auto(ns, { tag: "system" });
    ns.disableLog("ALL");
    ns.clearLog();

    await apply({
        node: "rawStylesheet",
        id: "server-graph-styles",
        style: SERVER_NODE_STYLE,
    });

    await apply({
        node: "rawStylesheet",
        id: "server-graph-server-menu-styles",
        style: SERVER_MENU_STYLE as any,
    });

    ns.tail();

    ns.printRaw(<ServerTree ns={ns} />);

    while (true) {
        await ns.asleep(10000);
    }
}
