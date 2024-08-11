import { NS, ScriptArg } from "@ns";
import { call, CallCommand, Index, Shifted, Split } from "./call";
import { run } from "/system/proc/run";

const WORKER_PATH = "call/call-worker.js";

declare global {
    // eslint-disable-next-line no-var
    var callValues: Map<string, any>;
}

type Awaitable<T> = T | Promise<T>;

globalThis.callValues = new Map();

export class CallPool {
    readonly promises = new Map<string, ReturnType<PromiseConstructor["withResolvers"]>>();

    public async call<
        C extends CallCommand,
        F = Index<NS, Split<C>>,
    >(ns: NS, command: C, ...args: F extends (...args: infer P) => any ? P : any[]): Promise<F extends (...args: any[]) => infer R ? R : never> {
        const id = `${Date.now()}_${Math.random()}`;

        const reservation = system.memory.reserve(1.6 + ns.getFunctionRamCost(command));
        if (!reservation) throw new Error("Failed to reserve memory");

        const [pid, finished] = run(
            ns,
            WORKER_PATH,
            {
                useReservation: reservation,
                temporary: true,
            },
            JSON.stringify({
                id,
                command,
                args,
            }),
        );

        if (!pid || !finished) {
            throw new Error("Failed to start worker");
        }

        await finished;

        const value = globalThis.callValues.get(id);
        globalThis.callValues.delete(id);
        return value;
    }

    /**
     * Executes a series of commands and stores their results in a Map.
     *
     * @param {NS} ns - The NS object from the game.
     * @param {DoOptions} commands - The commands to be executed. The can either be {@link DoOptions}s or functions that take the current call's variables and return {@link DoOptions}.
     * @return {Promise<Map<string, any>>} A Map containing the commands' resources as specified in their `store` field.
     */
    public async do(ns: NS, ...commands: DoCommand[]): Promise<Map<string, any>> {
        const variables = new Map<string, any>();
        let current: DoOptions | undefined | void;

        async function next(result: any): Promise<DoOptions | undefined | void> {
            const viaThen = typeof current?.then === "function" ? await current.then(result, variables) : current?.then;
            if (viaThen) return viaThen;

            const shifted = commands.shift();
            if (!shifted) return undefined;
            return typeof shifted === "function" ? await shifted(variables) : shifted;
        }

        current = await next(undefined);

        while (current) {
            try {
                let result: any = await this.call(ns, current!.command, ...current!.args);
                if (current.map) result = await current.map(result, variables);

                if (current.store) variables.set(current.store, result);
                current = await next(result);
            } catch (e) {
                current = typeof current?.catch === "function" ? await current?.catch(e, variables) : current?.catch;
            }
        }

        return variables;
    }
}

type DoCommand = DoOptions | ((variables: Map<string, any>) => Awaitable<DoOptions | undefined | void>);

export interface DoOptions<S extends CallCommand = CallCommand> {
    /**
     * NS function to call.
     */
    command: S;

    /**
     * Arguments to pass to the NS function.
     */
    // ignore the first two parameters of call, as they're just ns and the command.
    args: Shifted<Shifted<Parameters<typeof call<S>>>>;

    /**
     * Store the result of this call in a variable.
     */
    store?: string;
    /**
     * Map the result of this call to another value.
     */
    map?: (result: any, variables: Map<string, any>) => Awaitable<any>;

    then?: DoOptions | ((result: any, variables: Map<string, any>) => Awaitable<DoOptions | undefined | void>);
    catch?: DoOptions | ((error: any, variables: Map<string, any>) => Awaitable<DoOptions | undefined | void>);
}

export async function main(ns: NS) {
    const pool = new CallPool();

    const { _: [command, ...args] } = ns.flags([]) as {_: ScriptArg[]};
    if (typeof command !== "string") {
        ns.tprint("ERROR: Invalid command");
        return;
    }

    const result = await pool.do(ns, {
        command: command as CallCommand,
        // this is a hack.
        args: args as never,
        store: "result"
    });

    const value = result.get("result");
    if (value === undefined) {
        return ns.tprint("Result: undefined"); 
    }

    if (/Time/.test(command)) {
        return ns.tprint(`Result: ${ns.tFormat(value)}`);
    }

    if (/Ram/.test(command)) {
        return ns.tprint(`Result: ${ns.formatRam(value)}`);
    }

    // has to be lowercase because of inconsistent naming
    if (/money/.test(command)) {
        return ns.tprint(`Result: ${ns.formatNumber(value, 2)}`);
    }

    ns.tprint(`Result: ${value}`);
}