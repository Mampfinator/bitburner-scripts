//! Recursively call NS functions

import { NS } from "@ns";
import { call, CallCommand, Index, Split } from "./call";
import { Reservation } from "/system/memory";

type Awaitable<T> = Promise<T> | T;

interface CallOptions<
    C extends CallCommand = CallCommand,
    F = Index<NS, Split<C>>,
    A extends any[] = F extends (...args: infer P) => any ? P : any[],
    R = F extends (...args: any[]) => infer R ? R : never,
> {
    threads?: number;
    /**
     * NS function to call
     */
    function: C;
    /**
     * Arguments to pass to said function.
     */
    args: A;
    /**
     * A function to call when the result is ready.
     *
     * @returns The next commands to execute, or void.
     */
    then?: (result: R, variables: Record<string, any>) => Awaitable<CallOptions[] | void>;
    /**
     * The name of the variable to store the result in.
     */
    store?: string;
}

interface CallMoreOptions {
    reservation: Reservation;
    id: string;
    port: number;
    variables: Record<string, any>;
    commands: CallOptions[];
}

function deserialize(source: string): CallMoreOptions {
    const options: CallMoreOptions = JSON.parse(source);

    const raw = options.commands[0];

    if (!raw) return options;

    if (typeof raw.then === "string") {
        try {
            raw.then = eval(raw.then);
        } catch (e) {
            if (e instanceof SyntaxError && e.message === "Unexpected token '{'") {
                // method declarations are nontrivial to parse properly, so we convert them
                // to regular functions.
                // `this` should be preserved.
                raw.then = eval(`function ${raw.then}`);
            }
        }
    }

    options.variables ??= {};

    return options;
}

function stringifyFunctions(obj: any): unknown {
    const copy = structuredClone(obj);

    for (const [key, value] of Object.entries(copy)) {
        if (typeof value === "function") {
            copy[key] = value.toString();
        } else if (!Array.isArray(value) && typeof value === "object") {
            copy[key] = stringifyFunctions(value);
        }
    }

    return obj;
}

function serialize(options: CallMoreOptions): string {
    const noFns = stringifyFunctions(options);
    return JSON.stringify(noFns);
}

export async function main(ns: NS) {
    const options = deserialize(ns.args[0] as string);
    const command = options.commands.shift()!;

    if (!command) {
        return ns.writePort(options.port, { id: options.id, variables: options.variables });
    }

    const desired = (1.6 + ns.getFunctionRamCost(command.function) + 1) * (command.threads ?? 1);

    // base + function + run
    const actual = ns.ramOverride(desired);
    if (actual !== desired) {
        return ns.writePort(options.port, { id: options.id, variables: options.variables, error: "Insufficient RAM" });
    }

    try {
        const result = await call(ns, command.function, ...command.args);

        if (command.store) {
            options.variables[command.store] = result;
        }

        if (command.then) {
            const then = await command.then(result, options.variables);
            if (then) {
                options.commands.unshift(...then);
            }
        }

        if (options.commands.length > 0) {
            ns.run("call/call-more.js", { threads: options.commands[0]?.threads, temporary: true }, serialize(options));
        } else {
            ns.writePort(options.port, { id: options.id, variables: options.variables });
        }
    } catch (e) {
        return ns.writePort(options.port, { id: options.id, variables: options.variables, error: e });
    }
}
