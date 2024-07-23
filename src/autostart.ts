import { NS } from "@ns";
import { run } from "./system/proc/run";

declare global {
    var NS: NS;
}

export async function main(ns: NS) {
    ns.run("system/load.js");

    run(ns, "monitoring/cli.js", { hostname: "home", temporary: true }, "reset");

    run(ns, "auto-nuke.js", { hostname: "home", temporary: true });
    run(ns, "ccts/auto-solve.js", { hostname: "home", temporary: true });
    const [monitoringPid] = run(ns, "monitoring/monitor.js", { hostname: "home", temporary: true });
    ns.tail(monitoringPid);
    const [serversPid] = run(ns, "servers/dashboard.js", { hostname: "home", temporary: true });
    ns.tail(serversPid);

    await ns.asleep(1000);

    if (!ns.isRunning("hacking/supervisor.js")) run(ns, "hacking/supervisor.js", { hostname: "home" });

    run(ns, "gangs/await-start.js", { temporary: true, hostname: "home" });
}
