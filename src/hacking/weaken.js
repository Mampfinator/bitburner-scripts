import { WorkerPool } from "hacking/pool.js";

/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    const threads = Number(ns.args[1] ?? 20000);

    if (!ns.serverExists(target)) {
        ns.tprint(`Server ${target} doesn't exist.`);
        return;
    }

    const pool = new WorkerPool(ns, {
        reserveRam: {
            home: 64,
        },
    });

    const group = pool.reserveGroup(threads);

    group.start(target, "weaken");

    while (true) {
        pool.processMessages();

        const min = ns.getServerMinSecurityLevel(target);
        const current = ns.getServerSecurityLevel(target);

        if (min === current) {
            ns.toast(`Fully weakened ${target}.`, "info");

            pool.killAll();
            return;
        }

        await ns.sleep(100);
    }
}
