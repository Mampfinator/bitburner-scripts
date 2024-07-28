import { NS } from "@ns";

export function getServerNames(ns: NS, startFrom: string = "home") {
    const hostnames = new Set([startFrom]);
    const queue = [startFrom];

    while (queue.length > 0) {
        const current = queue.shift();

        for (const hostname of ns.scan(current).filter((name) => !hostnames.has(name))) {
            hostnames.add(hostname);
            queue.push(hostname);
        }
    }

    return [...hostnames];
}
