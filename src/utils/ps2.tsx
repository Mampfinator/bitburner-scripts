import { NS, RunningScript } from "@ns";
import { auto } from "/system/proc/auto";
import { ReservationDetails } from "/system/memory";

const { React } = globalThis;

type ProcessInfo = { pid: number; details: ReservationDetails; info: RunningScript };

export async function main(ns: NS) {
    auto(ns, { tag: "util" });

    const processes = system.proc
        .running()
        .map((pid) => ({
            pid,
            details: system.memory.info(system.proc.getReservation(pid)!),
            info: ns.getRunningScript(pid),
        }))
        .filter(({ info, details }) => info && details) as ProcessInfo[];

    const byServers = Object.groupBy(processes, ({ details }) => details.hostname) as Record<string, ProcessInfo[]>;

    for (const [_, processes] of Object.entries(byServers)) {
        processes.sort((a, b) => a.info.filename.localeCompare(b.info.filename));
    }

    const processList = Object.entries(byServers)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, processes]) => processes)
        .flat();

    for (const { pid, details, info } of processList) {
        ns.tprintRaw(
            <span>
                {info.server}: {info.filename} ({ns.formatRam(info.threads * info.ramUsage)} | PID {pid} |{" "}
                {details.tag ?? "unknown"})
            </span>,
        );
    }
}
