import { NS } from "@ns";


// TODO: migrate callack storage to SparseArray
export class EventEmitter<TEvents extends { [key: string]: undefined | ((...args: any[]) => void | Promise<void>) } = { [key: string]: (...args: any[]) => void | Promise<void> }> {
    #callbacks = new Map<keyof TEvents, Array<TEvents[keyof TEvents] | undefined>>();

    /**
     * @param event the event to listen to
     * @param callback
     * @returns this callback's ID. Use with `remove` to remove this callback again.
     */
    public on<TEvent extends keyof TEvents>(event: TEvent, callback: TEvents[TEvent]): number {
        const callbacks = this.#callbacks.get(event);
        if (!callbacks) {
            this.#callbacks.set(event, [callback]);
            return 0;
        }

        let index;
        for (index = 0; index < callbacks.length + 1; index++) {
            if (callbacks[index] === undefined) {
                callbacks[index] = callback;
                break;
            }
        }

        return index;
    }

    public async emit<TEvent extends keyof TEvents>(event: TEvent, ...args: TEvents[TEvent] extends Function ? Parameters<TEvents[TEvent]> : never): Promise<void> {
        const callbacks = this.#callbacks.get(event);
        if (!callbacks) return;

        for (let i = 0; i < callbacks.length; i++) {
            const callback = callbacks[i];
            if (!callback) continue;
            try {
                await callback(...args);
            } catch (error) {
                const e = error as any;
                // this seems to be the error for NS-use after script death; we catch these and remove the corresponding callbacks.
                if (
                    e?.constructor?.prototype?.name === "a" &&
                    e?.errorMessage === "" &&
                    typeof e?.pid === "number" &&
                    typeof e?.hostname === "string" &&
                    e?.name === "string"
                ) {
                    callbacks[i] = undefined;
                    console.warn(`NS-use after script death from ${e.hostname}/${e.name} (PID: ${e.pid})`);
                    // @ts-expect-error: Not supposed to be public.
                    this.emit("error:ns-after-script-death", e.hostname, e.name, e.pid);
                } else {
                    // @ts-expect-error: Not supposed to be public.
                    this.emit("error", e, event, ...args);
                }
            }
        }
    }

    /**
     * @returns the removed callback, or undefined if none was found.
     */
    public remove<TEvent extends keyof TEvents>(event: TEvent, id: number): TEvents[TEvent] | undefined {
        const callbacks = this.#callbacks.get(event);
        if (!callbacks) return undefined;

        const old = callbacks[id];
        callbacks[id] = undefined;

        return old as TEvents[TEvent];
    }

    /**
     * @param {string | symbol | number} event if not specified, clears all callbacks.
     */
    public clear<TEvent extends keyof TEvents>(event?: TEvent) {
        if (!event) this.#callbacks.clear();
        else {
            this.#callbacks.delete(event);
        }
    }

    /**
     * Register a callback with automatic cleanup on script exit.
     * @param ns
     * @param event
     * @param callback
     */
    public register<TEvent extends keyof TEvents>(ns: NS, event: TEvent, callback: TEvents[TEvent]): number {
        const callbackId = this.on(event, callback);
        ns.atExit(
            () => {
                this.remove(event, callbackId);
            },
            `clear-callback:${String(event)}:${callbackId}`,
        );
        return callbackId;
    }

    public withCleanup<TEvent extends keyof TEvents>(event: TEvent, callback: TEvents[TEvent], ns?: NS): () => void {
        const callbackId = ns ? this.register(ns, event, callback) : this.on(event, callback);
        return () => {
            this.remove(event, callbackId);
        };
    }
}

declare global {
    var eventEmitter: EventEmitter;
}

export async function load(_: NS) {
    globalThis.eventEmitter ??= new EventEmitter();
}
