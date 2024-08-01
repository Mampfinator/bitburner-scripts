//! Main monitoring loop. Use `watch` and `unwatch` to add/remove things from monitor.
import { NS } from "@ns";
import { readPort, sleep } from "/lib/lib";
import { auto } from "/system/proc/auto";
import { ServerData } from "/lib/servers/server-cache";
import { JSONSettings } from "/lib/settings";

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

class MonitoringSettings extends JSONSettings {
    constructor(ns: NS) {
        super(ns, "monitoring/monitoring.json");
    }

    protected servers: string[] = [];

    addServer(server: string) {
        this.servers = [...new Set([...this.servers, server])];
    }

    removeServer(server: string) {
        this.servers = this.servers.filter((s) => s !== server);
    }
}

export async function main(ns: NS) {
    auto(ns, { tag: "hacking" });
    ns.disableLog("ALL");

    const servers: Set<ServerData> = new Set();

    const statuses = new Map<string, HackingStatus>();
    const profit = new Map<string, number>();

    const profitSnapshots = new Map<string, number[]>();

    const prepared = new Set<string>();
    const threads = new Map<string, { hacking: number; growing: number; weakening: number }>();
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
                const server = globalThis.servers.get(target);
                if (!server) {
                    ns.toast(`Failed to monitor ${target}. No such server exists.`);
                    continue;
                }
                servers.add(server);
                if (!profitSnapshots.has(target)) profitSnapshots.set(target, []);
            } else if (message.event === "remove") {
                servers.delete(message.data.target);
                statuses.clear();
            } else if (message.event === "reset") {
                servers.clear();
                statuses.clear();
                profit.clear();
                threads.clear();
                ratios.clear();
            } else if (message.event === "setStatus") {
                const {
                    target,
                    status,
                    usedThreads: { hack: hacking, grow: growing, weaken: weakening } = {
                        hack: undefined,
                        grow: undefined,
                        weaken: undefined,
                    },
                    hackRatio,
                } = message.data;
                statuses.set(target, status);

                if (status === "hack") {
                    prepared.add(target);
                    ratios.set(target, hackRatio);
                }

                threads.set(target, { hacking, growing, weakening });
            } else if (message.event === "hacked") {
                const { target, amount } = message.data;
                profit.set(target, (profit.get(target) ?? 0) + amount);
            }
        }

        /**
         * @type {string[][]}
         */
        const printLines = [
            [
                "",
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

        for (const server of [...servers].sort((a, b) => a.hostname.localeCompare(b.hostname))) {
            server.refetch();

            const { moneyAvailable, moneyMax } = server;
            const moneyPercentage = moneyAvailable / moneyMax;

            let moneyColor = Mode.Foreground;
            if (moneyPercentage <= 0.15) moneyColor += Color.Red;
            else if (moneyPercentage <= 0.75) moneyColor += Color.Green;
            else moneyColor += Color.Cyan;

            const { hackDifficulty, minDifficulty } = server;

            let secColor = Mode.Foreground;
            const securityRatio = hackDifficulty / minDifficulty;
            if (securityRatio <= 1.1) secColor += Color.Cyan;
            else if (securityRatio <= 2) secColor += Color.Green;
            else secColor += Color.Red;

            const status = statuses.get(server.hostname) ?? "idle";

            const serverColor = Mode.Foreground + (STATUS_COLORS[status] ?? Color.Green);

            const line = [];

            let threadsStr = "";

            const usedThreads = threads.get(server.hostname);
            if (!usedThreads) threadsStr = "\x1b[31m?\x1b[0m";
            else {
                const threads = [];

                if (usedThreads.hacking !== undefined)
                    threads.push(`\x1b[3${Color.Cyan}m${usedThreads.hacking}\x1b[0m`);
                if (usedThreads.growing !== undefined)
                    threads.push(`\x1b[3${Color.Yellow}m${usedThreads.growing}\x1b[0m`);
                if (usedThreads.weakening !== undefined)
                    threads.push(`\x1b[3${Color.Magenta}m${usedThreads.weakening}\x1b[0m`);

                threadsStr += threads.join("/");
            }

            line.push(`[${threadsStr}] `);
            line.push(`${ESC}[${serverColor};1m${server.hostname}${ESC}[0m`);

            if (status === "hack") {
                const ratio = ratios.get(server.hostname);
                if (!ratio) line.push(" (\x1b[31m?\x1b[0m)");
                else line.push(` (\x1b[3${Color.Cyan}m${ratio.toFixed(2)}\x1b[0m)`);
            } else {
                line.push("");
            }

            line.push(" | ");

            line.push(`\$${ns.formatNumber(moneyAvailable)}/\$${ns.formatNumber(moneyMax)}`);
            line.push(` (${ESC}[${moneyColor}m${ns.formatPercent(moneyPercentage)}${ESC}[0m)`);

            line.push(" | ");

            const snapshots = profitSnapshots.get(server.hostname) ?? [];

            if (snapshots) {
                while (snapshots.length >= SNAPSHOT_SIZE) {
                    snapshots.shift();
                }
                snapshots.push(profit.get(server.hostname) ?? 0);

                const serverProfit = ((snapshots.at(-1) ?? 0) - (snapshots.at(0) ?? 0)) / (SNAPSHOT_SIZE * LOOP_DELAY);

                line.push(`+\$${ns.formatNumber(serverProfit)}/sec`);
            } else {
                line.push(`\x1b[31m?\x1b[0m`);
            }

            line.push(" | ");

            line.push(`${ESC}[${secColor}m${hackDifficulty.toFixed(2)}${ESC}[0m/${minDifficulty.toFixed(2)}`);

            printLines.push(line);
        }

        /**
         * @type {number[]}
         */
        const partLengths = [];

        for (const part of printLines) {
            for (let i = 0; i < part.length; i++) {
                const visiblePart = part[i].replaceAll(/\x1b\[([0-9]+;?)+m/g, "");

                const len = visiblePart.length;
                if (len > (partLengths[i] ?? 0)) partLengths[i] = len;
            }
        }

        for (const part of printLines) {
            let print = "";

            for (let i = 0; i < part.length; i++) {
                const length = partLengths[i];
                let segment = part[i];

                const visibleLength = part[i].replaceAll(/\x1b\[([0-9]+;?)+m/g, "").length;

                for (let j = 0; j < length - visibleLength; j++) {
                    segment += " ";
                }

                print += segment;
            }

            ns.print(print);
        }

        await sleep(LOOP_DELAY, true);
        ns.clearLog();
    }
}
