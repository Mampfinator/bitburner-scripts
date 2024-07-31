import { NS } from "@ns";
import { run } from "./system/proc/run";
import { auto } from "./system/proc/auto";
import { sleep } from "./lib/lib";
import { Reservation, ReservationDetails } from "./system/memory";

function shouldStartServerbuyer(ns: NS) {
    const serverMax = ns.getPurchasedServerLimit();
    const ramMax = ns.getPurchasedServerMaxRam();

    const servers = [...globalThis.servers.values()].filter(
        (server) => server.purchasedByPlayer && !server.isHacknetServer,
    );
    return servers.length < serverMax || servers.some((server) => server.maxRam < ramMax);
}

const SCRIPTS = [
    { script: "monitoring/cli.js", tag: "monitoring", args: ["reset"] },
    { script: "servers/server-menu.js", tag: "servers", condition: shouldStartServerbuyer },
    { script: "gangs/await-start.js", tag: "gang" },
    { script: "hacknet/hacknet.js", tag: "hacknet" },
    { script: "network/network-tree.js", tag: "monitoring" },
    { script: "hacking/supervisor.js", tag: "hacking", wait: 1000 },
];

export async function main(ns: NS) {
    const mainPid = ns.run("system/main.js");
    while (!globalThis.awaitSystemReady) {
        await ns.asleep(20);
    }
    await globalThis.awaitSystemReady(ns);

    const mainMemory = globalThis.system.memory.info(globalThis.system.proc.getReservation(mainPid)!)!.amount;

    ns.tprint(`Loaded system namespace and started system main loop using ${ns.formatRam(mainMemory)}.`);
    ns.tprint("Loading startup scripts...");

    auto(ns, { tag: "system" });

    const startedPids = [mainPid, ns.pid];

    const pending = [...SCRIPTS];
    while (pending.length > 0) {
        const script = pending.shift()!;

        if (script.condition?.(ns) ?? true) {
            if (script.wait) {
                ns.tprint(
                    chalk.blueBright(`Waiting ${script.wait}ms before starting ${chalk.cyan.bold(script.script)}.`),
                );
                await sleep(script.wait);
            }
            const [pid, , reservation] = run(ns, script.script, { tag: script.tag, hostname: "home" });

            if (pid > 0) {
                startedPids.push(pid);
                ns.tprint(`Started ${chalk.cyan.bold(script.script)} (PID: ${pid})`);
                if (reservation && system.memory.info(reservation)) {
                    const details = system.memory.info(reservation)!;
                    ns.tprint(
                        `${chalk.cyan.bold(script.script)} ${chalk.blueBright(`is using ${ns.formatRam(details.amount)} (Index: ${details.chunkIndex}, Tag: ${details.tag ?? "Unknown"})`)}`,
                    );
                }
            } else {
                ns.print(chalk.yellow(`Failed to start ${chalk.yellowBright.bold(script.script)}${chalk.yellow(".")}`));
                pending.push(script);
            }
        } else {
            ns.tprint(
                chalk.blueBright(
                    `Skipping ${chalk.cyan.bold(script.script)}${chalk.blueBright("(launch condition not met).")}`,
                ),
            );
        }

        await sleep(500, true);
    }

    const totalRamUsed = (
        (startedPids.map(system.proc.getReservation).filter(Boolean) as Reservation[])
            .map(system.memory.info)
            .filter(Boolean) as ReservationDetails[]
    ).reduce((acc, curr) => acc + curr.amount, 0);

    ns.tprint(`Total RAM used at the end of startup: ${ns.formatRam(totalRamUsed)}`);
    ns.tprint("Startup complete. ");
}
