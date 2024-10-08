import { NS } from "@ns";
import { auto } from "/system/proc/auto";
import { getServerNames } from "/lib/servers/names";
import { col } from "/lib/termcol";
import { share, WORKER_NAME } from "./share";
import { sleep } from "/lib/lib";

/**
 * @param {NS} ns
 */
export async function main(ns: NS) {
    auto(ns, { tag: "share" });

    let { threads, multiplier } = ns.flags([
        ["threads", 0],
        ["multiplier", 0],
    ]) as { threads: number; multiplier: number };

    if (threads === 0 && multiplier <= 1) {
        return ns.tprint(`ERROR: No valid "--threads" or "--multiplier" provided.`);
    }

    if (threads > 0 && multiplier > 0) {
        return ns.tprint(`ERROR: Either "--threads" or "--multiplier" required, not both.`);
    }

    const result = share(ns, { threads, multiplier });

    if (!result) {
        return ns.tprint("ERROR: failed to start share workers.");
    }

    const { kill, multiplier: finalMult, threads: finalThreads } = result;

    ns.atExit(() => {
        kill();
    });

    const style = col().cyan.bold;
    ns.tprint(
        `Sharing ${style(ns.formatNumber(finalThreads) + "t")} for a multiplier of ${style(ns.formatPercent(finalMult))}, using ${style(ns.formatRam(4 * finalThreads))} of memory.`,
    );

    while (true) {
        await sleep(10000, true);
    }
}
