import { WorkerPool } from "hacking/pool.js";

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0].trim?.();
    const threads = Number(ns.args[1] ?? 20000);

    if (!ns.serverExists(target)) {
        ns.tprint(`WARNING Server with name ${target} doesn't exist.`);
        return;
    }

    const pool = new WorkerPool(ns, {
        reserveRam: {
            home: 64,
        },
    });

    ns.atExit(() => {
        pool.killAll();
    });

    const growGroup = pool.reserveGroup(threads);
    const weakenGroup = pool.reserveGroup(Math.round(threads / 2));

    await growGroup.start(target, "grow");
    await weakenGroup.start(target, "weaken");

    while (true) {
        pool.processMessages();
        await ns.asleep(5000);

        if (
            ns.getServerMoneyAvailable(target) >=
                ns.getServerMaxMoney(target) * 0.99 &&
            ns.getServerSecurityLevel(target) <=
                ns.getServerMinSecurityLevel(target) * 0.99
        )
            break;
    }
}
