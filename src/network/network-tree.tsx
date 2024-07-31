import { NS } from "@ns";
import { SERVER_NODE_STYLE } from "./ServerNode";
import { apply } from "/system/dependencies";
import { auto } from "/system/proc/auto";
import { SERVER_MENU_STYLE } from "./ServerMenu";
import { ServerTree } from "./ServerTree";
import { sleep } from "/lib/lib";

const { React } = globalThis;

export async function main(ns: NS) {
    auto(ns, { tag: "system" });
    ns.disableLog("ALL");
    ns.clearLog();

    await apply({
        type: "rawStylesheet",
        style: SERVER_NODE_STYLE,
    }, "server-graph-styles");

    await apply({
        type: "rawStylesheet",
        style: SERVER_MENU_STYLE as any,
    }, "server-graph-server-menu-styles");

    ns.tail();

    ns.printRaw(<ServerTree ns={ns} />);

    while (true) {
        await sleep(10000, true);
    }
}
