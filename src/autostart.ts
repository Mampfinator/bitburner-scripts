import { NS } from "@ns";

declare global {
    var NS: NS;
}

export async function main(ns: NS) {
    ns.run("system/load.js");

    // reset monitoring
    ns.run("monitoring/cli.js", { temporary: true }, "reset");

    ns.run("auto-nuke.js", { temporary: true });
    ns.run("ccts/auto-solve.js", { temporary: true });
    const monitoringPid = ns.run("monitoring/monitor.js", { temporary: true });
    ns.tail(monitoringPid);
    const serversPid = ns.run("servers/dashboard.js", { temporary: true });
    ns.tail(serversPid);

    await ns.asleep(1000);

    if (!ns.isRunning("hacking/supervisor.js")) ns.run("hacking/supervisor.js");

    ns.run("gangs/await-start.js", { temporary: true });
}
