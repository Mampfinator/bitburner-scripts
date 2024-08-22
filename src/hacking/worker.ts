import { NS } from "@ns";
import { getWorkerScriptCost, WORKER_MESSAGE_PORT_BASE, WorkerMessage, WorkerMode } from "./consts";
import { readPort } from "/lib/lib";

function roundToHundreths(x: number) {
    return Math.round(x * 100) / 100;
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
        mode: WorkerMode;
    };

    if (typeof autoContinue !== "boolean")
        throw new Error(
            `Invalid argument. Expected autoContinue to be boolean, got ${typeof autoContinue} (${autoContinue})`,
        );

    if (typeof target !== "string" || target === "" || !(globalThis.servers.get(target))) {
        throw new Error(`Invalid target: ${target} (${typeof target}).`);
    }

    if (typeof mode !== "string" || (mode !== "hack" && mode !== "grow" && mode !== "weaken")) {
        throw new Error(`Invalid mode: ${mode} (${typeof mode}).`);
    }

    const required = getWorkerScriptCost(ns, mode);
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

    let reject: ((reason: any) => void) | undefined;
    let promise: Promise<void> | undefined;

    while (true) {
        for await (const message of readPort<WorkerMessage>(port)) {
            if (message.event === "start") {
                const { data } = message;

                if (promise) {
                    console.error(`Worker ${pid} already started.`, data);
                    ns.print("Worker already started.");
                    continue;
                }

                const { options } = data;

                promise = new Promise<void>(async (res, rej) => {
                    reject = rej;

                    const result = await ns[mode](target, options);
                    send("done", {result});
                    res();
                }).catch(() => {
                    ns.print("Aborted.");
                }).finally(() => {
                    reject = undefined;
                    promise = undefined;
                });
            } else if (message.event === "stop") {
                return;
            } else if (message.event === "abort") {
                // if we don't have anything to abort, we just ignore the message.
                if (!promise || !reject) continue;
                reject(undefined);
            }
        }

        await port.nextWrite();
    }
}
