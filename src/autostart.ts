import { NS } from "@ns";
import { run } from "./system/proc/run";
import { load } from "system/load";
import { auto } from "./system/proc/auto";
import { sleep } from "./lib/lib";

function shouldStartServerbuyer(ns: NS) {
    const serverMax = ns.getPurchasedServerLimit();
    const ramMax = ns.getPurchasedServerMaxRam();

    const servers = ns.getPurchasedServers();

    return servers.length < serverMax || servers.some((server) => ns.getServerMaxRam(server) < ramMax);
}

export async function main(ns: NS) {
    await load(ns);

    auto(ns, { tag: "system" });

    run(ns, "monitoring/cli.js", { hostname: "home", temporary: true }, "reset");

    run(ns, "auto-nuke.js", { hostname: "home", temporary: true });
    run(ns, "ccts/auto-solve.js", { hostname: "home", temporary: true });
    const [monitoringPid] = run(ns, "monitoring/monitor.js", {
        hostname: "home",
        temporary: true,
    });
    ns.tail(monitoringPid);
    if (shouldStartServerbuyer(ns)) {
        const [serversPid] = run(ns, "servers/server-menu.js", {
            hostname: "home",
            temporary: true,
        });
        ns.tail(serversPid);
    }

    await sleep(1000, true);

    if (!ns.isRunning("hacking/supervisor.js")) run(ns, "hacking/supervisor.js", { hostname: "home" });

    run(ns, "gangs/await-start.js", { temporary: true, hostname: "home" });
}
