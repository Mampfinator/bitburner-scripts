import { BasicHGWOptions, NetscriptPort, NS } from "@ns";

/**
 * Port read by Workers.
 */
const WORKER_MESSAGE_PORT_BASE = 10000;

function roundToHundreths(x: number) {
    return Math.round(x * 100) / 100;
}

function* readPort<T = Record<string, any>>(port: NetscriptPort): Generator<{ event: string; data: T }, void> {
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

    const { autoContinue, target, mode } = ns.flags([
        ["autoContinue", false],
        ["target", ""],
        ["mode", ""],
    ]) as {
        autoContinue: boolean;
        target: string;
        mode: "hack" | "grow" | "weaken";
    };

    if (typeof autoContinue !== "boolean")
        throw new Error(
            `Invalid argument. Expected autoContinue to be boolean, got ${typeof autoContinue} (${autoContinue})`,
        );

    if (typeof target !== "string" || target === "") {
        throw new Error(`Invalid target: ${target} (${typeof target}).`);
    }

    if (typeof mode !== "string" || (mode !== "hack" && mode !== "grow" && mode !== "weaken")) {
        throw new Error(`Invalid mode: ${mode} (${typeof mode}).`);
    }

    const required = 1.6 + ns.getFunctionRamCost(mode);
    const actual = ns.ramOverride(required);
    if (roundToHundreths(actual) < roundToHundreths(required)) {
        throw new Error(`Insufficient RAM. Required: ${ns.formatRam(required)}. Actual: ${ns.formatRam(actual)}`);
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

    let promise: Promise<number> | undefined;

    while (true) {
        for await (const { event, data } of readPort<{ options?: BasicHGWOptions }>(port)) {
            if (event === "start") {
                if (promise) {
                    console.error(`Worker ${pid} already started.`, data);
                    continue;
                }

                const { options } = data;

                promise = ns[mode](target, options).then((n) => {
                    promise = undefined;
                    send("done", { result: n });
                    return n;
                });
            } else if (event === "stop") {
                return;
            }
        }

        await port.nextWrite();
    }
}
