import { NS } from "@ns";
import { ServerNode } from "./ServerNode";

const { React } = globalThis;

export async function main(ns: NS) {
    ns.clearLog();
    ns.tail();
    ns.printRaw(<ServerNode data={{ server: ns.getServer() }} />);
}
