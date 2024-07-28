import { AutocompleteData, NS, ScriptArg } from "@ns";
import { auto } from "system/proc/auto";

const FLAGS = [
    ["override", 0],
    ["tag", "debug"],
    ["target", "home"],
] as any;

export function autocomplete(data: AutocompleteData, args: ScriptArg[]) {
    if (args.at(-1) === "target" || args.at(-2) === "target") return data.servers;
    if (args.at(-1) === "tag" || args.at(-2) === "tag") return ["debug", "hack", "grow", "weaken", "share", "unknown"];

    data.flags(FLAGS);
    return [];
}

export async function main(ns: NS) {
    const { override, tag, target } = ns.flags(FLAGS) as {
        override: number;
        tag: string;
        target: string;
    };

    auto(ns);

    const reservation = globalThis.system.memory.reserve(override, {
        tag,
        onServer: target,
    });

    if (!reservation) ns.tprint("WARNING: Failed to reserve memory.");
    ns.atExit(() => {
        if (reservation) globalThis.system.memory.free(reservation);
    });

    while (true) {
        await ns.sleep(1000);
    }
}
