import { NS, ReactNode } from "@ns";
import { getServers } from "/lib/servers/servers";

const { React } = globalThis;

const e = React.createElement;

interface DashboardProps {
    ns: NS;
    initialAuto?: boolean;
    onToggleAuto: () => void;
    onSetMinRam: (ramExp: number) => void;
    onSetMinMoney: (money: number) => void;
}

function Dashboard(props: DashboardProps) {
    const { ns, onToggleAuto, onSetMinRam, onSetMinMoney } = props;

    return e("div", null, [
        e(AutoBuyConfiguration, {
            ns,
            onToggleAuto,
            onSetMinRam,
            onSetMinMoney,
        }),
        e("hr", { style: { width: "100%" } }),
        e(ManualBuyMenu, { ns }),
    ]);
}

interface AutobuyProps {
    ns: NS;
    initialAuto?: boolean;
    onToggleAuto: () => void;
    onSetMinRam: (ramExp: number) => void;
    onSetMinMoney: (money: number) => void;
}

function AutoBuyConfiguration(props: AutobuyProps) {
    const { ns, onToggleAuto, initialAuto, onSetMinRam, onSetMinMoney } = props;

    const [auto, setAuto] = React.useState(initialAuto ?? false);
    const [minRam, setMinRam] = React.useState(0);
    const [minMoney, setMinMoney] = React.useState(0);

    return e(
        "div",
        {
            style: {
                display: "flex",
                flexDirection: "column",
                padding: "0.25rem",
                margin: "5px",
                fontSize: "16pt",
            },
        },
        [
            e(
                "button",
                {
                    style: {
                        backgroundColor: auto ? "green" : "red",
                        padding: "0.25rem",
                    },
                    onClick: () => {
                        setAuto(!auto);
                        onToggleAuto();
                    },
                },
                `Automatically buy new servers: ${auto ? "Enabled" : "Disabled"}`,
            ),
            e(
                "label",
                { for: "min-ram" },
                `Minimum RAM for new servers: ${ns.formatRam(2 ** minRam)}`,
            ),
            e("input", {
                type: "range",
                id: "min-ram",
                min: 0,
                max: 20,
                value: minRam,
                onInput: (event) => {
                    const exp = Number(event.currentTarget.value);
                    setMinRam(exp);
                    onSetMinRam(exp);
                },
            }),
            e(
                "label",
                { for: "min-money" },
                `Keep at least \$${ns.formatNumber(minMoney)}`,
            ),
            e("input", {
                type: "number",
                id: "min-money",
                min: 0,
                onInput: (event) => {
                    const money = Number(event.currentTarget.value);
                    setMinMoney(money);
                    onSetMinMoney(money);
                },
            }),
        ],
    );
}

interface ManualBuyProps {
    ns: NS;
}

/**
 * Manual buy menu, because the tech store one sucks even more.
 */
function ManualBuyMenu(props: ManualBuyProps) {
    const { ns } = props;

    const [ramExp, setRamExponent] = React.useState(0);
    const [name, setName] = React.useState<undefined | string>(undefined);

    function buy() {
        const serverName = ns.purchaseServer(
            name ?? `home${ns.getPurchasedServers().length}`,
            2 ** ramExp,
        );
        if (serverName === "") {
            ns.toast(
                `Failed to buy server. This might mean that you don't have enough money.`,
                "error",
                5000,
            );
        } else {
            ns.toast(
                `Bough server ${name} with ${ns.formatRam(2 ** ramExp)}.`,
                "success",
                5000,
            );
        }
    }

    return e(
        "form",
        {
            onSubmit: (e) => {
                // We do **not** want to submit this to a server, we just act on it locally
                e.preventDefault();
                buy();
                return false;
            },
            style: {
                display: "flex",
                flexDirection: "column",
                padding: "0.25rem",
                margin: "5px",
                fontSize: "16pt",
            },
        },
        [
            e(
                "label",
                { for: "server-ram" },
                `RAM: ${typeof ramExp == "number" ? ns.formatRam(2 ** ramExp) : "? GB"} | Price: \$${ns.formatNumber(ns.getPurchasedServerCost(2 ** ramExp))}`,
            ),
            e("input", {
                id: "server-ram",
                type: "range",
                min: 0,
                max: 20,
                step: 1,
                value: ramExp,
                onInput: (event) => {
                    setRamExponent(
                        Number((event.nativeEvent.target as any).value),
                    );
                },
            }),
            e("input", {
                id: "server-name",
                type: "text",
                placeholder: "Server Name (defaults to home)",
                value: name,
                onInput: (e) => {
                    setName(e.currentTarget.value);
                },
            }),
            e("input", { type: "submit", value: "Manually Buy" }),
        ],
    );
}

export async function main(ns: NS) {
    ns.setTitle("Purchase Servers");
    ns.disableLog("ALL");
    ns.clearLog();

    let auto = false;
    let minMoney = 0;
    let minRamExp = 0;

    const dashboardNode = e(Dashboard, {
        ns,
        onToggleAuto: () => (auto = !auto),
        initialAuto: auto,
        onSetMinRam: (ramExp) => (minRamExp = ramExp),
        onSetMinMoney: (money) => (minMoney = money),
    });

    if (!dashboardNode) {
        ns.tprint(
            "ERROR: Failed to initialize server buy dashboard. Check console for potential React errors.",
        );
    }

    ns.printRaw(dashboardNode as ReactNode);

    while (true) {
        await ns.asleep(50);
        if (!auto) continue;
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
            }
        }
    }
}
