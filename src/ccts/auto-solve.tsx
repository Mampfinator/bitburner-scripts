//! This script scans through all servers and attempts to automatically solve any coding contracts it finds.
import { NS } from "@ns";
import { findCcts } from "ccts/find.js";
import { MessageBus } from "/lib/messages";
import { CCTSDashboard, DashboardMessage } from "./dashboard";

const { React } = globalThis;

export enum ContractRewardType {
    Money,
    Reputation,
}

interface MoneyReward {
    type: ContractRewardType.Money;
    amount: number;
}

enum ReputationRewardTargetType {
    Company,
    Faction,
}

interface ReputationReward {
    type: ContractRewardType.Reputation;
    targetType: ReputationRewardTargetType;
    amountPerTarget: number;
    targets: string[];
}

export type ContractReward = MoneyReward | ReputationReward;

// TODO: there has to be a more generic way of doing this. But this is fine for now.
const MULTIPLIERS = ["", "k", "m", "b", "t", "q", "Q"];

/**
 * Attempt to parse a number formatted with `ns.formatNumber`.
 */
export function unformatNumber(string: string): number | null {
    const [, numStr, , letter] = /([0-9]+(\.[0-9]+)?)([A-Za-z])*/.exec(string.trim())!;

    const multIndex = MULTIPLIERS.indexOf(letter);
    if (multIndex < 0) return null;
    
    return Number(numStr) * (1000 ** multIndex);
}

const MONEY_REGEX = /(?<=\$).+\b/

/**
 * Parse a reward string returned from `ns.codingcontract.attempt`.
 */
function parseRewardString(reward: string) : ContractReward | null {
    reward = reward.trim();
    if (reward.length === 0) return null;

    if (MONEY_REGEX.test(reward)) {
        const moneyString = reward.match(MONEY_REGEX)![0];
        const amount = unformatNumber(moneyString);

        if (!amount) return null;

        return {
            type: ContractRewardType.Money,
            amount
        }
    } else if (reward.includes("reputation")) {
        const amountStr = reward.split(" ")[1];
        const amount = unformatNumber(amountStr);

        if (!amount) return null;

        if (reward.includes("each of the")) {
            const factions = reward.split(":")[1].split(", ");
            return {
                type: ContractRewardType.Reputation,
                targetType: ReputationRewardTargetType.Faction,
                targets: factions,
                amountPerTarget: amount,
            }
        } else {
            let targetType: ReputationRewardTargetType;
            if (reward.includes("company")) {
                targetType = ReputationRewardTargetType.Company;
            } else {
                targetType = ReputationRewardTargetType.Faction;
            }

            const [target] = reward.match(/(?<=for ).*?(?=\.)/)!;

            return {
                type: ContractRewardType.Reputation,
                targetType,
                amountPerTarget: amount,
                targets: [target!]
            }
        }
    } else {
        return null;
    }
}

export async function main(ns: NS) {
    ns.disableLog("ALL");
    ns.clearLog();

    const messageBus = new MessageBus<DashboardMessage>();

    ns.printRaw(<CCTSDashboard messageBus={messageBus} ns={ns}/>);

    const contractTypes = new Map<string, string>();
    const solvers = new Map<string, (data: any) => any>();

    async function syncSolvers() {
        const solverScripts = ns.ls(ns.getHostname(), "ccts/solvers/");
        const knownScripts = new Set(contractTypes.keys());

        for (const script of solverScripts) {
            if (knownScripts.has(script)) {
                knownScripts.delete(script);
                continue;
            };

            const scriptUri = `data:text/javascript;base64,` + btoa(ns.read(script));
            const {contractType, solve} = await import(scriptUri) as {contractType: string, solve: (data: any) => any};
            
            contractTypes.set(script, contractType);
            solvers.set(contractType, solve);
        }

        // solver has been deleted/moved. Yeet its entries.
        for (const script of knownScripts) {
            const contractType = contractTypes.get(script);
            if (!contractType) continue;
            solvers.delete(contractType);
            contractTypes.delete(script);
        }
    }

    function reportUnsolvable(hostname: string, file: string, type: string) {}
    function reportError(hostname: string, file: string, type: string, remaining: number, data: any, solution: any) {
        ns.toast(`Failed to solve ${hostname}:${file} (${type}). Remaining tries: ${remaining}. Check console for more details.`, "warning");
        console.warn(`Failed to solve ${hostname}:${file} (${type}).`, data, solution);
    }
    function reportSuccess(hostname: string, file: string, type: string, rewardString: string) {
        const reward = parseRewardString(rewardString);
        if (!reward) return;
        // TODO report to dashboard
    }

    while (true) {
        await syncSolvers();

        const ccts = findCcts(ns);

        for (const [hostname, filename] of ccts) {
            const type = ns.codingcontract.getContractType(filename, hostname);

            const solve = solvers.get(type);

            if (!solve) {
                reportUnsolvable(hostname, filename, type);
                continue;
            }

            const data = ns.codingcontract.getData(filename, hostname);
            const solution = solve(data);

            const reward = ns.codingcontract.attempt(solution, filename, hostname);

            if (reward === "") {
                const remaining = ns.codingcontract.getNumTriesRemaining(filename, hostname);
                reportError(hostname, filename, type, remaining, data, solution);
                continue;
            }

            reportSuccess(hostname, filename, type, reward);
        }

        // sleep 5 minutes
        await ns.sleep(1000 * 60 * 5);
    }
}
