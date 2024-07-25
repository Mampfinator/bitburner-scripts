import { NS } from "@ns";
import { ServerBuyMessage, ServerBuyDashboard } from "./dashboard";
import { MessageBus } from "/lib/messages";
import { register } from "/system/memory";
import { auto } from "/system/proc/auto";
import { getServers } from "/lib/servers/servers";

const { React } = globalThis;

export async function main(ns: NS) {
    auto(ns);
    ns.setTitle("Purchase Servers");
    ns.disableLog("ALL");
    ns.clearLog();

    let autoBuy = false;
    let minMoney = 0;
    let minRamExp = 0;

    const messageBus = new MessageBus<ServerBuyMessage>();

    messageBus.subscribe(message => {
        switch (message.name) {
            case "setMinMoney":
                minMoney = message.money;
                break;
            case "setMinRam":
                minRamExp = message.exp;
                break;
            case "toggleAuto":
                autoBuy = !autoBuy;
                break;
        }
    });

    ns.printRaw(<ServerBuyDashboard ns={ns} messageBus={messageBus} initialAuto={autoBuy}/>);

    while (true) {
        await ns.asleep(50);
        if (!autoBuy) continue;
        if (ns.getServerMoneyAvailable("home") <= minMoney) continue;

        const servers = getServers(ns, "home").filter(
            (server) => server.purchasedByPlayer && server.hostname !== "home",
        );

        const maxRam = ns.getPurchasedServerMaxRam();
        for (const server of servers.filter(
            (server) => server.maxRam < maxRam,
        )) {
            const newRam = server.maxRam * 2;

            const upgradeCost = ns.getPurchasedServerUpgradeCost(
                server.hostname,
                newRam,
            );

            if (
                minMoney === 0 ||
                ns.getServerMoneyAvailable("home") - upgradeCost > minMoney
            ) {
                ns.upgradePurchasedServer(server.hostname, newRam);
                register({hostname: server.hostname, maxRam: newRam, hasAdminRights: true});
            }
        }

        while (
            (minMoney === 0 || ns.getServerMoneyAvailable("home") > minMoney) &&
            ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(1) &&
            servers.length < ns.getPurchasedServerLimit()
        ) {
            let ram = 2 ** minRamExp;

            ram = 1;
            while (ram < maxRam) {
                const newRam = ram * 2;
                if (
                    ns.getServerMoneyAvailable("home") -
                        ns.getPurchasedServerCost(newRam) >
                    minMoney
                ) {
                    ram = newRam;
                } else {
                    break;
                }
            }

            const name = ns.purchaseServer(
                `home${ns.getPurchasedServers().length}`,
                ram,
            );
            const success = name.length > 0;

            if (!success) {
                ns.toast(
                    `Attempted to a buy server with ${ram} GB of RAM, but failed.`,
                    "warning",
                );
                // something is wrong, so we bail for now.
                break;
            } else {
                ns.toast(`Bought ${name} with ${ram} GB of RAM.`, "success");
                register({hostname: name, maxRam: ram, hasAdminRights: true});
            }
        }
    }
}
