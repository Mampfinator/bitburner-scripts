import { NetscriptPort, NS } from "@ns";

/**
 * Port read by Workers.
 */
const WORKER_MESSAGE_PORT_BASE = 10000;

function* readPort(
    port: NetscriptPort,
): Generator<{ event: string; data: Record<string, any> }, void> {
    while (true) {
        const message = port.read();
        if (message === "NULL PORT DATA") return;

        if (!message || typeof message !== "object") continue;
        yield message;
    }
}

export async function main(ns: NS) {
    const pid = ns.pid;
    const port = ns.getPortHandle(WORKER_MESSAGE_PORT_BASE + pid);

    const { autoContinue, target } = ns.flags([
        ["autoContinue", false],
        ["target", ""],
    ]) as {
        autoContinue: boolean;
        target: string;
    };
    if (typeof autoContinue !== "boolean")
        throw new Error(
            `Invalid argument. Expected autoContinue to be boolean, got ${typeof autoContinue} (${autoContinue})`,
        );

    if (typeof target !== "string" || target === "") {
        throw new Error(`Invalid target: ${target}.`);
    }

    /**
     * Send a message back to the Pool.
     */
    function send(event: string, data?: Record<string, any>) {
        globalThis.eventEmitter.emit(`worker:${event}`, {
            ...(data ?? {}),
            pid,
        });
    }

    ns.atExit(() => {
        globalThis.system.proc.killed(ns.pid);
        send("killed");
    });

    let stopped = true;

    while (true) {
        for (const { event, data } of readPort(port)) {
            if (event === "start") {
                stopped = false;
            } else {
                console.error("Unknown event in weaken worker.");
                console.error(event, data);
            }
        }

        if (stopped || !target) {
            await ns.nextPortWrite(WORKER_MESSAGE_PORT_BASE + pid);
            continue;
        }

        const result = await ns.weaken(target);

        if (!autoContinue) stopped = false;

        send("done", {
            mode: "weaken",
            target,
            result,
        });
    }
}
