import { NS } from "@ns";
import { call } from "./call";

export interface CallWorkerOptions {
    id: string;
    command: string;
    args: any[];
}

export async function main(ns: NS) {
    ns.atExit(() => {
        globalThis.system.proc.killed(ns);
    });

    const options = JSON.parse(ns.args[0] as string) as CallWorkerOptions;

    const callCost = ns.getFunctionRamCost(options.command);
    ns.ramOverride(1.6 + callCost);

    const result = await call(ns, options.command, ...options.args);
    globalThis.callValues.set(options.id, result);
}
