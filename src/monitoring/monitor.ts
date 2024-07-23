//! Main monitoring loop. Use `watch` and `unwatch` to add/remove things from monitor.
import { NS } from "@ns";
import { readPort } from "/lib/lib";
import { calcThreads } from "/lib/network-threads";
import { auto } from "/system/proc/auto";

export const MONITORING_PORT = 10;

const ESC = "\x1b";

enum Color {
    Black = 0,
    Red = 1,
    Green = 2,
    Yellow = 3,
    Blue = 4,
    Magenta = 5,
    Cyan = 6,
}

const Mode = {
    Foreground: 30,
    Background: 40,
};

enum HackingStatus {
    Preparing = "preparing",
    Hack = "hack",
    Idle = "idle",
}

const STATUS_COLORS: Record<HackingStatus, Color> = {
    preparing: Color.Yellow,
    hack: Color.Cyan,
    idle: Color.Magenta,
};

const LOOP_DELAY = 250;
// 5 minutes; because one loop is 250ms.
const SNAPSHOT_SIZE = 4 * 60 * 5;

export async function main(ns: NS) {
    auto(ns);
    ns.disableLog("ALL");

    let servers: Set<string>;

    if (ns.fileExists("monitoring/servers.json")) {
        const data = JSON.parse(ns.read("monitoring/servers.json"));
        servers = new Set(data.servers);
    } else {
        servers = new Set();
    }

    function save() {
        ns.write(
            "monitoring/servers.json",
            JSON.stringify({ servers: [...servers] }),
            "w",
        );
    }

    ns.atExit(() => {
        save();
    });

    const statuses = new Map<string, HackingStatus>();
    const profit = new Map<string, number>();

    const profitSnapshots = new Map<string, number[]>();

    const prepared = new Set<string>();
    const threads = new Map<
        string,
        { hack: number; grow: number; weaken: number }
    >();
    const ratios = new Map<string, number>();

    const port = ns.getPortHandle(MONITORING_PORT);

    let lastServers = 0;

    while (true) {
        if (lastServers != servers.size) {
            ns.setTitle(`Monitoring ${servers.size} servers`);
            lastServers = servers.size;
        }

        for (const message of readPort(port)) {
            if (message.event === "add") {
                const { target } = message.data;

                if (!ns.serverExists(target)) {
                    ns.toast(
                        `Failed to monitor ${target}. No such server exists.`,
                    );
                    continue;
                }
                servers.add(target);
                if (!profitSnapshots.has(target))
                    profitSnapshots.set(target, []);
                save();
            } else if (message.event === "remove") {
                servers.delete(message.data.target);
                statuses.clear();
                save();
            } else if (message.event === "reset") {
                servers.clear();
                statuses.clear();
                profit.clear();
                threads.clear();
                ratios.clear();
                save();
            } else if (message.event === "setStatus") {
                const {
                    target,
                    status,
                    threads: usedThreads,
                    hackRatio,
                } = message.data;
                statuses.set(target, status);

                if (status === "hack") {
                    prepared.add(target);
                    ratios.set(target, hackRatio);
                }

                threads.set(target, usedThreads);
            } else if (message.event === "hacked") {
                const { target, amount } = message.data;
                profit.set(target, (profit.get(target) ?? 0) + amount);
            }
        }

        const networkThreads = calcThreads(ns);

        /**
         * @type {string[][]}
         */
        const printLines = [
            [
                `${ESC}[1m${networkThreads.free}/${networkThreads.total}${ESC}[0m - `,
                `${ESC}[1mServer${ESC}[0m`,
                "",
                //`${ESC}[${Mode.Foreground + STATUS_COLORS.preparing}mPreparing${ESC}[0m/${ESC}[${Mode.Foreground + STATUS_COLORS.hack}mHacking${ESC}[0m/${ESC}[${Mode.Foreground + STATUS_COLORS.idle}mIdle${ESC}[0m`,
                " | ",
                `${ESC}[1mMoney${ESC}[0m`,
                "",
                " | ",
                `${ESC}[1mProfit${ESC}[0m`,
                " | ",
                `${ESC}[1mSecurity${ESC}[0m`,
            ],
        ];

        for (const server of [...servers].sort()) {
            const currentMoney = ns.getServerMoneyAvailable(server);
            const maxMoney = ns.getServerMaxMoney(server);
            const moneyPercentage = currentMoney / maxMoney;

            let moneyColor = Mode.Foreground;
            if (moneyPercentage <= 0.15) moneyColor += Color.Red;
            else if (moneyPercentage <= 0.75) moneyColor += Color.Green;
            else moneyColor += Color.Cyan;

            const currentSec = ns.getServerSecurityLevel(server);
            const minSec = ns.getServerMinSecurityLevel(server);

            let secColor = Mode.Foreground;
            const securityRatio = currentSec / minSec;
            if (securityRatio <= 1.1) secColor += Color.Cyan;
            else if (securityRatio <= 2) secColor += Color.Green;
            else secColor += Color.Red;

            const status = statuses.get(server) ?? "idle";

            const serverColor =
                Mode.Foreground + (STATUS_COLORS[status] ?? Color.Green);

            const line = [];

            let threadsStr = "";

            const usedThreads = threads.get(server);
            if (!usedThreads) threadsStr = "\x1b[31m?\x1b[0m";
            else {
                const threads = [];

                if (usedThreads.hack !== undefined)
                    threads.push(
                        `\x1b[3${Color.Cyan}m${usedThreads.hack}\x1b[0m`,
                    );
                if (usedThreads.grow !== undefined)
                    threads.push(
                        `\x1b[3${Color.Yellow}m${usedThreads.grow}\x1b[0m`,
                    );
                if (usedThreads.weaken !== undefined)
                    threads.push(
                        `\x1b[3${Color.Magenta}m${usedThreads.weaken}\x1b[0m`,
                    );

                threadsStr += threads.join("/");
            }

            line.push(`[${threadsStr}] `);
            line.push(`${ESC}[${serverColor};1m${server}${ESC}[0m`);

            if (status === "hack") {
                const ratio = ratios.get(server);
                if (!ratio) line.push(" (\x1b[31m?\x1b[0m)");
                else
                    line.push(
                        ` (\x1b[3${Color.Cyan}m${ratio.toFixed(2)}\x1b[0m)`,
                    );
            } else {
                line.push("");
            }

            line.push(" | ");

            line.push(
                `\$${ns.formatNumber(currentMoney)}/\$${ns.formatNumber(maxMoney)}`,
            );
            line.push(
                ` (${ESC}[${moneyColor}m${ns.formatPercent(moneyPercentage)}${ESC}[0m)`,
            );

            line.push(" | ");

            const snapshots = profitSnapshots.get(server) ?? [];

            if (snapshots) {
                while (snapshots.length >= SNAPSHOT_SIZE) {
                    snapshots.shift();
                }
                snapshots.push(profit.get(server) ?? 0);

                const serverProfit =
                    ((snapshots.at(-1) ?? 0) - (snapshots.at(0) ?? 0)) /
                    (SNAPSHOT_SIZE * LOOP_DELAY);

                line.push(`+\$${ns.formatNumber(serverProfit)}/sec`);
            } else {
                line.push(`\x1b[31m?\x1b[0m`);
            }

            line.push(" | ");

            line.push(
                `${ESC}[${secColor}m${currentSec.toFixed(2)}${ESC}[0m/${minSec.toFixed(2)}`,
            );

            printLines.push(line);
        }

        /**
         * @type {number[]}
         */
        const partLengths = [];

        for (const part of printLines) {
            for (let i = 0; i < part.length; i++) {
                const visiblePart = part[i].replaceAll(
                    /\x1b\[([0-9]+;?)+m/g,
                    "",
                );

                const len = visiblePart.length;
                if (len > (partLengths[i] ?? 0)) partLengths[i] = len;
            }
        }

        for (const part of printLines) {
            let print = "";

            for (let i = 0; i < part.length; i++) {
                const length = partLengths[i];
                let segment = part[i];

                const visibleLength = part[i].replaceAll(
                    /\x1b\[([0-9]+;?)+m/g,
                    "",
                ).length;

                for (let j = 0; j < length - visibleLength; j++) {
                    segment += " ";
                }

                print += segment;
            }

            ns.print(print);
        }

        await ns.sleep(LOOP_DELAY);
        ns.clearLog();
    }
}
