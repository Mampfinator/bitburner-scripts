//! This script scans through all servers and attempts to automatically solve any coding contracts it finds.
import { NS } from "@ns";
import { findCcts } from "ccts/find.js";
import { MessageBus } from "/lib/messages";
import { CCTSDashboard, CCTSMessageType, DashboardMessage } from "./dashboard";
import { parseRewardString } from "./consts";

const { React } = globalThis;

export async function main(ns: NS) {
    ns.disableLog("ALL");
    ns.clearLog();

    const messageBus = new MessageBus<DashboardMessage>();

    ns.printRaw(<CCTSDashboard messageBus={messageBus} formatNumber={(number) => ns.formatNumber(number)}/>);

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

    function reportUnsolvable(hostname: string, file: string, type: string) {
        messageBus.send({
            type: CCTSMessageType.Unsolvable,
            hostname,
            filename: file,
            contractType: type,
        });
    }
    function reportError(hostname: string, file: string, type: string, remaining: number, data: any, solution: any) {
        ns.toast(`Failed to solve ${hostname}:${file} (${type}). Remaining tries: ${remaining}. Check console for more details.`, "warning");
        console.warn(`Failed to solve ${hostname}:${file} (${type}).`, data, solution);

        messageBus.send({
            type: CCTSMessageType.Failed,
            filename: file,
            hostname, 
            contractType: type,
            remaining,
            solution,
            data
        });
    }
    function reportSuccess(hostname: string, file: string, type: string, rewardString: string) {
        const reward = parseRewardString(rewardString);
        if (!reward) return console.log(`Failed to parse contract reward, but contract was completed.`, rewardString);
        // TODO report to dashboard

        messageBus.send({
            type: CCTSMessageType.Success,
            hostname, 
            filename: file,
            contractType: type,
            reward
        });


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
        await ns.asleep(1000 * 60 * 5);
    }
}
