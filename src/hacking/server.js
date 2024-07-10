import { WorkerPool, WorkerGroup } from "hacking/pool.js";
import { getServers } from "util.js";
import { MONITORING_PORT } from "monitoring/monitor.js";

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    ns.enableLog("exec");

    const target = ns.args[0];

    console.log("Got target: ", target);

    if (!target) {
        ns.toast(`Could not start server: no target specified.`, "error");
    }

    const threads = Number(ns.args[1] ?? 8000);

    console.log("Got threads", threads);

    ns.print(`Using ${threads} threads.`);

    if (!ns.serverExists(target)) {
        ns.toast(`No such server: ${target}. Aborting.`, "error");
        return;
    }

    const serverString = `Server ${target}(${threads})`;
    ns.setTitle(`${serverString} - Idle`);

    const pool = new WorkerPool(ns, {
        reserveRam: {
            home: 512,
        },
    });

    ns.atExit(() => {
        pool.killAll();
    });

    for (const server of getServers(ns).filter(
        (server) => server.hasAdminRights,
    )) {
        if (server.hostname === "home") continue;
        ns.scp("hacking/worker.js", server.hostname, "home");
    }

    let stage = "weaken";

    /**
     * @type { WorkerGroup }
     */
    let weakenGroup;
    /**
     * @type { WorkerGroup }
     */
    let growGroup;

    /**
     * @type { {start(target: string): Promise<boolean>} }
     */
    let execGroup;

    ns.atExit(() => {
        weakenGroup?.kill();
        growGroup?.kill();
        execGroup?.kill();
        pool.killAll();
    });

    const monitoringPort = ns.getPortHandle(MONITORING_PORT);

    const monitoringMessages = [];

    let stop = false;

    while (!stop || monitoringMessages.length > 0) {
        if (!stop) {
            if (stage === "weaken") {
                if (
                    ns.getServerSecurityLevel(target) <=
                    ns.getServerMinSecurityLevel(target) * 1.25
                ) {
                    if (!!weakenGroup)
                        ns.toast(
                            `Switching from weaken to growing for ${target}.`,
                            "info",
                            null,
                        );
                    stage = "grow";

                    console.log(`switching ${target} to ${stage}`);

                    weakenGroup?.kill();
                    weakenGroup = null;
                    continue;
                }

                if (!weakenGroup) {
                    ns.print("Starting weakening.");
                    ns.setTitle(`${serverString} - Weakening`);
                    const group = pool.reserveGroup(threads);

                    group.start(target, "weaken");

                    // hacked together while I procrastinate fixing start promises
                    if (false) {
                        ns.toast(
                            `Could not start server: weaken group failed to initialize.`,
                            "error",
                            null,
                        );
                        return;
                    }
                    weakenGroup = group;
                    monitoringMessages.push({
                        event: "setStatus",
                        data: { target, status: "weaken" },
                    });
                }
            } else if (stage === "grow") {
                if (
                    ns.getServerMoneyAvailable(target) >=
                    ns.getServerMaxMoney(target) * 0.9
                ) {
                    if (!!growGroup)
                        ns.toast(
                            `Switching from growing to exec for ${target}.`,
                            "info",
                            null,
                        );

                    if (
                        ns.getServerSecurityLevel(target) >
                        ns.getServerMinSecurityLevel(target) * 1.25
                    )
                        stage = "weaken";
                    else stage = "exec";

                    console.log(`switching ${target} to ${stage}`);

                    growGroup?.kill();
                    growGroup = null;
                    continue;
                }

                if (!growGroup) {
                    ns.print("Starting growing.");
                    ns.setTitle(`${serverString} - Growing`);
                    const group = pool.reserveGroup(threads);

                    group.start(target, "grow");

                    if (false) {
                        ns.toast(
                            `Could not start server: grow group failed to initialize.`,
                            "error",
                            null,
                        );
                        return;
                    }
                    growGroup = group;
                    monitoringMessages.push({
                        event: "setStatus",
                        data: { target, status: "grow" },
                    });
                }
            } else if (stage === "exec") {
                if (!execGroup) {
                    ns.print("Starting hacking.");
                    ns.setTitle(`${serverString} - Hacking`);
                    execGroup = pool.reserveGroupsByRatio(threads);

                    execGroup.start(target);

                    monitoringMessages.push({
                        event: "setStatus",
                        data: { target, status: "hack" },
                    });

                    ns.toast(
                        `Started hacking ${serverString}.`,
                        "success",
                        null,
                    );
                }

                if (ns.getServerMoneyAvailable(target) === 0) {
                    monitoringMessages.push({
                        event: "remove",
                        data: { target },
                    });
                    stop = true;
                    ns.toast(
                        `Server ${target} has been completely drained. This isn't *technically* supposed to happen, but might still for starter servers.`,
                        "warning",
                        null,
                    );
                }
            }
        }

        pool.processMessages();

        while (monitoringMessages.length > 0) {
            if (monitoringPort.full()) break;

            const message = monitoringMessages.shift();

            console.log("Sending", message, "to monitor.");

            monitoringPort.write(message);
        }

        await ns.sleep(200);
    }
}
