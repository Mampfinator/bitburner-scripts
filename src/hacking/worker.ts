import { NetscriptPort, NS } from "@ns";

/**
 * Port read by Workers.
 */
const WORKER_MESSAGE_PORT_BASE = 10000;

function* readPort(
    port: NetscriptPort,
): Generator<{ event: string; pid: number; data: Record<string, any> }, void> {
    while (true) {
        const message = port.read();
        if (message === "NULL PORT DATA") return;

        if (!message || typeof message !== "object") continue;
        yield message;
    }
}

export async function main(ns: NS) {
    ns.disableLog("sleep");

    ns.atExit(() => {
        send("killed");
    });

    const port = ns.getPortHandle(WORKER_MESSAGE_PORT_BASE + ns.pid);

    let stopped = true;

    const poolPort = ns.args[0] as number;
    if (!poolPort || typeof poolPort !== "number")
        throw new Error(`Invalid pool port: ${poolPort}.`);

    let target = ns.args[1] as string | undefined;
    if (target === "") target = undefined;

    let mode = ns.args[2] as string | undefined;
    if (mode === "") mode = undefined;

    let autoContinue = ns.args[3] ?? true;

    ns.print(
        `Got initial args - Target: ${target}/Mode: ${mode}/Auto continue: ${autoContinue}`,
    );

    const pid = ns.pid;

    /**
     * Send a message back to the Pool.
     */
    function send(event: string, data?: Record<string, any>) {
        globalThis.eventEmitter.emit(`worker:${event}`, {
            ...(data ?? {}),
            pid,
        });
    }

    while (true) {
        for (const { event, pid, data } of readPort(port)) {
            // message is not for us
            if (pid !== ns.pid) continue;
            if (event === "stop") {
                ns.print("Got stop event.");

                stopped = true;

                send("stopped");
            } else if (event === "start") {
                ns.print(
                    `Got start event: ${data.mode}:${data.target} (Continue: ${data.autoContinue ? "auto" : "manual"}).`,
                );
                if (!stopped)
                    throw new Error(
                        `Cannot start a worker that is already running.`,
                    );

                if (data.target) target = data.target;
                if (data.mode) mode = data.mode;
                if (typeof data.autoContinue !== undefined)
                    autoContinue = data.autoContinue;

                stopped = false;

                send("started");
            } else if (event === "resume") {
                ns.print(`Got resume event.`);
                stopped = false;
                send("resumed");
            }
        }

        if (stopped || !target || !mode) {
            await ns.sleep(20);
            continue;
        }

        let promise: Promise<number>;
        if (mode === "hack") promise = ns.hack(target);
        else if (mode === "weaken") promise = ns.weaken(target);
        else if (mode === "grow") promise = ns.grow(target);
        else throw new TypeError(`Unknown mode in Worker(${ns.pid}): ${mode}`);

        const result = await promise;

        send("done", {
            mode: mode,
            target: target,
            result,
        });

        if (!autoContinue) {
            ns.print("Waiting for continue.");
            stopped = true;
        }
    }
}
