import { NS, Server } from "@ns";
import { getServerNames } from "./names";

export function getServers(ns: NS, startFrom = "home"): Server[] {
    return [...getServerNames(ns, startFrom)].map((h) => ns.getServer(h));
}
