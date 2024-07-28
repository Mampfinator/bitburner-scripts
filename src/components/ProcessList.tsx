import { NS, ProcessInfo } from "@ns";

const { React } = globalThis;

function Process({ process, ns, server }: { process: ProcessInfo, ns: NS, server: string }) {
    const ram = ns.getScriptRam(process.filename, server);
    const reservation = system.proc.getReservation(process.pid);
    const details = reservation && system.memory.info(reservation);

    return <span>{process.filename} ({ns.formatRam(process.threads * ram)} | {details?.tag ?? "Unknown"})</span>;
}

export function ProcessList({ processes, ns, server }: { server: string, processes: ProcessInfo[], ns: NS }) {
    return <div className="process-list">
        {processes.map((process) => <Process key={process.pid} process={process} ns={ns} server={server} />)}
    </div>;
}