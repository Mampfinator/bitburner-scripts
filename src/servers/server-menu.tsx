import { NS, Server } from "@ns";
import { ServerBuyMessage, ServerBuyDashboard } from "./dashboard";
import { MessageBus } from "/lib/messages";
import { register } from "/system/memory";
import { auto } from "/system/proc/auto";
import { JSONSettings } from "/lib/settings";

const { React } = globalThis;

class ServerBuySettings extends JSONSettings {
    public autoBuy = false;
    public minMoney = 0;
    public minRamExp = 0;
}

export async function main(ns: NS) {
    auto(ns);
    ns.setTitle("Purchase Servers");
    ns.disableLog("ALL");
    ns.clearLog();

    const settings = new ServerBuySettings(ns, "servers/settings.json");

    const messageBus = new MessageBus<ServerBuyMessage>();

    messageBus.subscribe((message) => {
        switch (message.name) {
            case "setMinMoney":
                settings.minMoney = message.money;
                break;
            case "setMinRam":
                settings.minRamExp = message.exp;
                break;
            case "toggleAuto":
                settings.autoBuy = !settings.autoBuy;
                break;
        }
    });

    ns.printRaw(
        <ServerBuyDashboard
            ns={ns}
            messageBus={messageBus}
            initialAuto={settings.autoBuy}
        />,
    );

    function getUpgradeCost(server: Server): number {
        if (server.hostname === "home")
            return ns.singularity.getUpgradeHomeRamCost();
        else
            return ns.getPurchasedServerUpgradeCost(
                server.hostname,
                server.maxRam * 2,
            );
    }

    function upgradeOnce(server: Server): boolean {
        if (server.hostname === "home") return ns.singularity.upgradeHomeRam();
        else
            return ns.upgradePurchasedServer(
                server.hostname,
                server.maxRam * 2,
            );
    }

    while (true) {
        await ns.asleep(50);
        if (!settings.autoBuy) continue;
        if (ns.getServerMoneyAvailable("home") <= settings.minMoney) continue;

        const servers = ns
            .getPurchasedServers()
            .map((server) => ns.getServer(server));
        const maxRam = ns.getPurchasedServerMaxRam();

        for (const server of servers.filter(
            (server) =>
                (server.hostname !== "home" && server.maxRam < maxRam) ||
                (server.hostname !== "home" && server.maxRam < 2 ** 32),
        )) {
            const upgradeCost = getUpgradeCost(server);

            if (
                settings.minMoney === 0 ||
                ns.getServerMoneyAvailable("home") - upgradeCost >
                    settings.minMoney
            ) {
                const success = upgradeOnce(server);
                if (success)
                    register({
                        hostname: server.hostname,
                        maxRam: ns.getServer(server.hostname).maxRam,
                        hasAdminRights: true,
                    });
            }
        }

        while (
            ns.getPurchasedServers().length < ns.getPurchasedServerLimit() &&
            (settings.minMoney === 0 ||
                ns.getServerMoneyAvailable("home") > settings.minMoney) &&
            ns.getServerMoneyAvailable("home") >
                ns.getPurchasedServerCost(2 ** settings.minRamExp)
        ) {
            let ram = 2 ** settings.minRamExp;

            ram = 1;
            while (ram < maxRam) {
                const newRam = ram * 2;
                if (
                    ns.getServerMoneyAvailable("home") -
                        ns.getPurchasedServerCost(newRam) >
                    settings.minMoney
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
                register({ hostname: name, maxRam: ram, hasAdminRights: true });
            }
        }
    }
}
