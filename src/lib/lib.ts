import { NetscriptPort, NS } from "@ns";

export function* readPort(port: NetscriptPort) {
    if (port.empty()) return;
    while (true) {
        const message = port.read();
        if (message === "NULL PORT DATA") return;
        yield message;
    }
}

/**
 * Sleeps for `ms` milliseconds.
 *
 * @param ms number of milliseconds to sleep.
 * @param forceUncompressed if `true`, circumvents time compression.
 */
export function sleep(ms: number, forceUncompressed?: boolean) {
    return new Promise((resolve) => {
        if (!forceUncompressed) setTimeout(resolve, ms);
        else (globalThis.originalSetTimeout ?? globalThis.setTimeout)(resolve, ms);
    });
}

/**
 * @returns a tuple of all `[passed, failed]` elements.
 */
export function splitFilter<T>(arr: T[], filterFn: (element: T, index: number) => boolean): [T[], T[]] {
    const passed: T[] = [];
    const failed: T[] = [];

    arr.forEach((element, index) => {
        if (filterFn(element, index)) {
            passed.push(element);
        } else {
            failed.push(element);
        }
    });

    return [passed, failed];
}

/***
 * Crude sparse array implementation that implements *some* `Array` methods.
 * It acts a lot like a `Map` with automatic keys.
 */
export class SparseArray<T> {
    private readonly array: (T | undefined)[] = [];
    protected readonly freeSlots = new Set<number>();

    /**
     * Length of the underlying array.
     */
    get length() {
        return this.array.length;
    }

    [Symbol.iterator]() {
        return this.array[Symbol.iterator]();
    }

    public clone(): SparseArray<T> {
        const clone = new SparseArray<T>();

        clone.array.push(...this.array);
        for (const slot of this.freeSlots) {
            clone.freeSlots.add(slot);
        }

        return clone;
    }

    constructor(from?: Iterable<T | undefined>) {
        if (from) this.array.push(...from);
    }

    public push(item: T): number {
        if (this.freeSlots.size === 0) {
            return this.array.push(item) - 1;
        }

        const slot: number = this.freeSlots.values().next().value;
        this.array[slot] = item;
        this.freeSlots.delete(slot);
        return slot;
    }

    public remove(index: number): T | undefined {
        if (index > this.array.length - 1) return undefined;
        if (this.freeSlots.has(index)) return undefined;

        const item = this.array[index];
        this.array[index] = undefined;
        this.freeSlots.add(index);

        return item;
    }

    public set(index: number, newValue: T): T | undefined {
        if (index > this.array.length) {
            for (let i = this.array.length; i < index; i++) {
                this.freeSlots.add(i);
            }
        }

        if (this.freeSlots.has(index)) {
            this.array[index] = newValue;
            this.freeSlots.delete(index);
            return undefined;
        }

        const old = this.array[index];
        this.array[index] = newValue;
        return old;
    }

    public get(index: number): T | undefined {
        return this.array[index];
    }

    public values() {
        return this.array.values();
    }

    public entries() {
        return this.array.entries();
    }
}

export class SimpleSparseArray<T> extends Array<T> {
    /**
     * Push an item into the Array.
     * If there are no empty slots, grows the Array.
     *
     * @returns the index of the inserted item.
     */
    override push(item: T): number {
        let index = this.findIndex((item) => item === undefined);
        if (index === -1) index = this.length;

        this[index] = item;

        return index;
    }

    public delete(index: number): void {
        delete this[index];
    }
}

/**
 * Load a script dynamically.
 * Scripts loaded this way are **not** cached, and cannot be type inferred.
 *
 * @returns the script's exports
 */
export async function dynamicImport<T = any>(ns: NS, path: string): Promise<T> {
    const script = ns.read(path);
    const scriptUri = `data:text/javascript;base64,` + btoa(script);
    return (await import(scriptUri)) as T;
}

export function pluralize(singular: string, plural: string, amount: number) {
    return amount === 1 ? singular : plural;
}

export function formatTime(time: number): string {
    const milliseconds = Math.floor(time % 1000);

    time /= 1000;
    const seconds = Math.floor(time % 60);

    time /= 60;
    const minutes = Math.floor(time % 60);

    time /= 60;
    const hours = Math.floor(time % 24);

    time /= 24;
    const days = Math.floor(time);

    const units = (
        [
            [milliseconds, "ms"],
            [seconds, "s"],
            [minutes, "m"],
            [hours, "h"],
            [days, "d"],
        ] as const
    )
        .filter(([unit]) => unit > 0)
        .reverse();

    if (units.length === 0) return "0s";
    return units.map((input) => input.join("")).join("");
}

/**
 * Finds the minimum and maximum values in an array.
 *
 * @param items array of items
 * @param accessor function that takes an item and returns a number
 */
export function findExtremes<T>(items: T[], accessor: (item: T) => number): { max: T; min: T } | undefined {
    if (items.length === 0) return undefined;
    let max = items[0];
    let maxValue = accessor(max);
    let min = items[0];
    let minValue = maxValue;
    for (const item of items) {
        const value = accessor(item);
        if (value > maxValue) {
            max = item;
            maxValue = value;
        }

        if (value < minValue) {
            min = item;
            minValue = value;
        }
    }
    return { max, min };
}

/**
 * A Promise that can be externally resolved and rejected.
 */
export class ControllablePromise<T> extends Promise<T> {
    public readonly resolve!: (value: T | PromiseLike<T>) => T;
    public readonly reject!: (reason?: any) => void;

    constructor(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
        super((resolve, reject) => {
            //@ts-expect-error: alternative is more wordy.
            this.resolve = value => { resolve(value); return this; };
            //@ts-expect-error: alternative is more wordy.
            this.reject = reject;
            executor?.(resolve, reject);
        })
    }
}