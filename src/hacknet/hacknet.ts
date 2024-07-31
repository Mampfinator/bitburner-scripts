import { NodeStats, NS } from "@ns";
import { auto } from "system/proc/auto";
import { JSONSettings } from "/lib/settings";
import { sleep } from "/lib/lib";
import { register } from "/system/memory";

class HacknetSettings extends JSONSettings {
    constructor(ns: NS) {
        super(ns, "hacknet/settings.json");
    }

    /**
     * Percentage of current money the script can spend at any given time.
     */
    spendMaxMoney: number = 0.1;
    /**
     * Keep at least this much money. No limit if set to 0.
     */
    keepAtLeast: number = 0;

    /**
     * Percentage of maximum hashes the script can spend at any given time.
     */
    // Are hashes even worth keeping around? Do we need this option?
    spendMaxHashes: number = 0.9;
}

enum UpgradeOption {
    Level = "Level",
    RAM = "RAM",
    Cores = "Cores",
    Cache = "Cache",
}

export async function main(ns: NS) {
    auto(ns, { tag: "hacknet" });

    ns.disableLog("ALL");
    ns.clearLog();

    const settings = new HacknetSettings(ns);
    settings.load();

    const { hacknet } = ns;

    const hacknetConstants = ns.formulas.hacknetServers.constants();

    /**
     * Whether the given hacknet node can be upgraded with the given option.
     */
    function canUpgrade(node: NodeStats, option: UpgradeOption) {
        switch (option) {
            case UpgradeOption.Cores:
                return node.cores < hacknetConstants.MaxCores;
            case UpgradeOption.Cache:
                return node.cache! < hacknetConstants.MaxCache;
            case UpgradeOption.RAM:
                return node.ram < hacknetConstants.MaxRam;
            case UpgradeOption.Level:
                return node.level < hacknetConstants.MaxLevel;
        }
    }

    /**
     * Whether the player can buy more hacknet nodes.
     */
    function canBuyNew(): boolean {
        return hacknet.numNodes() < hacknet.maxNumNodes();
    }

    /**
     * Calculates the best hash-rate-gained-per-$-spent upgrade for a given hacknet node.
     * Returns `null` if no upgrades are available.
     *
     * This will **never** return a cache upgrade, as it has no effect on hash rate.
     */
    function getBestUpgrade(node: number): [UpgradeOption, number] | null {
        const current = hacknet.getNodeStats(node);

        /**
         * Simulates the hash gain rate of a hacknet server with 1 level of the selected upgrade(s) applied.
         */
        const simulateHashRateIncrease = ({ level, ram, core }: { level?: boolean; ram?: boolean; core?: boolean }) => {
            return (
                ns.formulas.hacknetServers.hashGainRate(
                    current.level + (level ? 1 : 0),
                    0,
                    current.ram * (ram ? 2 : 1),
                    current.cores + (core ? 1 : 0),
                ) - ns.formulas.hacknetServers.hashGainRate(current.level, 0, current.ram, current.cores)
            );
        };

        const upgrades: [number, UpgradeOption, number][] = [];

        if (canUpgrade(current, UpgradeOption.Cores)) {
            const coreCost = hacknet.getCoreUpgradeCost(node);
            const cores = (simulateHashRateIncrease({ core: true }) * 1000) / coreCost;
            upgrades.push([cores, UpgradeOption.Cores, coreCost]);
        }

        if (canUpgrade(current, UpgradeOption.RAM)) {
            const ramCost = hacknet.getRamUpgradeCost(node);
            const ram = (simulateHashRateIncrease({ ram: true }) * 1000) / ramCost;
            upgrades.push([ram, UpgradeOption.RAM, ramCost]);
        }

        if (canUpgrade(current, UpgradeOption.Level)) {
            const levelCost = hacknet.getLevelUpgradeCost(node);
            const level = (simulateHashRateIncrease({ level: true }) * 1000) / levelCost;
            upgrades.push([level, UpgradeOption.Level, levelCost]);
        }

        if (upgrades.length === 0) {
            return null;
        }

        const [_, upgradeOption, cost] = upgrades.sort((a, b) => b[0] - a[0])[0];
        return [upgradeOption, cost];
    }

    /**
     * Upgrade a hacknet node.
     *
     * @returns whether the upgrade was successful.
     */
    function upgrade(node: number, option: UpgradeOption) {
        switch (option) {
            case UpgradeOption.Cores:
                return hacknet.upgradeCore(node);
            case UpgradeOption.RAM:
                return hacknet.upgradeRam(node);
            case UpgradeOption.Level:
                return hacknet.upgradeLevel(node);
            case UpgradeOption.Cache:
                return hacknet.upgradeCache(node);
        }
    }

    while (true) {
        settings.load();

        let nodes = hacknet.numNodes();

        let budget = ns.getServerMoneyAvailable("home") * settings.spendMaxMoney;
        if (settings.keepAtLeast > 0 && ns.getServerMoneyAvailable("home") - budget < settings.keepAtLeast) {
            budget = ns.getServerMoneyAvailable("home") - settings.keepAtLeast;
        }

        if (nodes === 0 && hacknet.getPurchaseNodeCost() < budget) {
            hacknet.purchaseNode();
            nodes += 1;
            budget -= hacknet.getPurchaseNodeCost();
            ns.print(`Bought initial hacknet node for $${ns.formatNumber(hacknet.getPurchaseNodeCost())}.`);
        }

        ns.print(`Budget: $${ns.formatNumber(budget)}`);

        // Upgrade loop
        for (let node = 0; node < nodes; node++) {
            if (budget <= 0) break;
            const bestUpgrade = getBestUpgrade(node);

            const option = bestUpgrade?.[0];
            const cost = bestUpgrade?.[1];

            // Prefer buying new nodes over upgrading existing ones if it's cheaper, or no upgrades are available.
            const buyNewCost = hacknet.getPurchaseNodeCost();
            if (canBuyNew() && (!cost || buyNewCost < cost) && buyNewCost < budget) {
                const success = hacknet.purchaseNode() >= 0;

                if (success) {
                    register({ hostname: `hacknet-server-${nodes}`, hasAdminRights: true, maxRam: 1 });
                    nodes += 1;
                    budget -= buyNewCost;
                    ns.print(`Bought new hacknet node for $${ns.formatNumber(buyNewCost)}.`);
                    continue;
                }
            }

            // upgrade cache whenever we can. It's not essential, but nice to have.
            const cacheUpgradeCost = hacknet.getCoreUpgradeCost(node);
            if (
                canUpgrade(hacknet.getNodeStats(node), UpgradeOption.Cache) &&
                cacheUpgradeCost < budget &&
                (!cost || cacheUpgradeCost < cost)
            ) {
                const success = upgrade(node, UpgradeOption.Cache);
                if (success) {
                    budget -= cacheUpgradeCost;
                    ns.print(`Upgraded hacknet node ${node}'s cache for $${ns.formatNumber(cacheUpgradeCost)}.`);
                    continue;
                }
            }

            if (!option || !cost) {
                ns.print(`No upgrades available for hacknet node ${node}.`);
                continue;
            }
            if (cost > budget) {
                ns.print(`No afforable upgrade for hacknet node ${node}.`);
                continue;
            }

            const success = upgrade(node, option);
            ns.print(`Upgrading node ${node}'s ${option} for $${ns.formatNumber(cost)}`);
            if (!success) {
                ns.print(`WARNING: Failed to upgrade hacknet node ${node}.`);
                continue;
            }

            if (option === UpgradeOption.RAM) {
                register({
                    hostname: `hacknet-server-${node}`,
                    hasAdminRights: true,
                    maxRam: hacknet.getNodeStats(node).ram,
                });
            }

            budget -= cost;
        }

        // TODO: implement properly.
        const maxHashes = hacknet.hashCapacity();
        const spendHashes = Math.floor(maxHashes * settings.spendMaxHashes);

        hacknet.spendHashes("Sell for Money", undefined, Math.floor(spendHashes / hacknet.hashCost("Sell for Money")));

        await sleep(1000, true);
    }
}
