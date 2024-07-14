import { NS } from "@ns";

class EventEmitter {
    #callbacks = new Map<
        string | symbol | number,
        Array<((...args: any[]) => void | Promise<void>) | undefined>
    >();

    /**
     * @param event the event to listen to
     * @param callback
     * @returns this callback's ID. Use with `remove` to remove this callback again.
     */
    on(
        event: string | symbol | number,
        callback: (...args: any[]) => void,
    ): number {
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

    async emit(event: string | symbol | number, ...args: any[]) {
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
                    console.warn(
                        `NS-use after script death from ${e.hostname}/${e.name} (PID: ${e.pid})`,
                    );
                }
            }
        }
    }

    /**
     * @returns the removed callback, or undefined if none was found.
     */
    remove(
        event: string | symbol | number,
        id: number,
    ): ((...args: any[]) => void) | undefined {
        const callbacks = this.#callbacks.get(event);
        if (!callbacks) return undefined;

        const old = callbacks[id];
        callbacks[id] = undefined;

        return old;
    }

    /**
     * @param {string | symbol | number} event if not specified, clears all callbacks.
     */
    clear(event?: string | symbol | number) {
        if (!event) this.#callbacks.clear();
        else {
            this.#callbacks.delete(event);
        }
    }
}

declare global {
    var eventEmitter: EventEmitter;
}

export async function main(ns: NS) {
    globalThis.eventEmitter ??= new EventEmitter();
    // clear callbacks from last reset/reload, if EventEmitter persisted
    globalThis.eventEmitter.clear();
}
