import { NS } from "@ns";

// TODO: migrate callack storage to SparseArray
export class EventEmitter {
    #callbacks = new Map<string | symbol | number, Array<((...args: any[]) => void | Promise<void>) | undefined>>();

    /**
     * @param event the event to listen to
     * @param callback
     * @returns this callback's ID. Use with `remove` to remove this callback again.
     */
    public on(event: string | symbol | number, callback: (...args: any[]) => void): number {
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

    public async emit(event: string | symbol | number, ...args: any[]) {
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
                    this.emit("error:ns-after-script-death", e.hostname, e.name, e.pid);
                } else {
                    this.emit("error", e, event, ...args);
                }
            }
        }
    }

    /**
     * @returns the removed callback, or undefined if none was found.
     */
    public remove(event: string | symbol | number, id: number): ((...args: any[]) => void) | undefined {
        const callbacks = this.#callbacks.get(event);
        if (!callbacks) return undefined;

        const old = callbacks[id];
        callbacks[id] = undefined;

        return old;
    }

    /**
     * @param {string | symbol | number} event if not specified, clears all callbacks.
     */
    public clear(event?: string | symbol | number) {
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
    public register(ns: NS, event: string | symbol | number, callback: (...args: any[]) => void): number {
        const callbackId = this.on(event, callback);
        ns.atExit(
            () => {
                this.remove(event, callbackId);
            },
            `clear-callback:${String(event)}:${callbackId}`,
        );
        return callbackId;
    }

    public withCleanup(event: string, listener: (...args: any[]) => void, ns?: NS): () => void {
        const callbackId = ns ? this.register(ns, event, listener) : this.on(event, listener);
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
