import { NetscriptPort, NS } from "@ns";

export function* readPort<T = any>(port: NetscriptPort): Generator<T, void> {
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

const TIME_UNITS = [
    [1000, "ms"],
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [1, "d"],
] as const;

export function formatDuration(time: number): string {
    let out = "";
    for (const [divisor, unit] of TIME_UNITS) {
        const value = Math.floor(time % divisor);
        time /= divisor;

        if (value > 0) {
            out = `${value}${unit}${out}`;
        }
    }

    return out.length > 0 ? out : "0ms";
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

const DEFAULT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomString(length: number, alphabet = DEFAULT_ALPHABET) {
    let out = "";

    for (let i = 0; i < length; i++) {
        out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }

    return out;
}


export class OrderError<T> extends Error {
    constructor(
        public readonly a: { index: number; finishedAt: Date; result: T },
        public readonly b: { index: number; finishedAt: Date; result: T },
    ) {
        super(`Promise ${b.index} finished before ${a.index}: ${Number(a.finishedAt)} < ${Number(b.finishedAt)}`);
    }
}

/**
 * Assert that all promises finish in the order they're specified.
 *
 * @throws An `OrderError` if any Promise finishes in the wrong order.
 */
export async function assertFinishedInOrder<T>(...promises: Promise<T>[]): Promise<T[]> {
    if (promises.length <= 1) return Promise.all(promises); 

    const withTimestamp = promises.map((p) => p.then((result) => ({ finishedAt: new Date(), result })));

    let { finishedAt } = await withTimestamp[0];

    for (let i = 1; i < withTimestamp.length; i++) {
        const current = await withTimestamp[i];
        if (current.finishedAt < finishedAt) throw new OrderError<T>({ ...(await withTimestamp[i - 1]), index: i - 1 }, { ...current, index: i });
        finishedAt = current.finishedAt;
    }

    return Promise.all(promises);
}


// TODO: there has to be a more generic way of doing this. But this is fine for now.
const NUMBER_SUFFIXES = ["", "k", "m", "b", "t", "q", "Q"];

/**
 * Attempt to parse a number formatted with `ns.formatNumber`.
 */
export function unformatNumber(string: string): number | null {
    const [, numStr, , letter] = /([0-9]+(\.[0-9]+)?)([A-Za-z])*/.exec(string.trim())!;

    const multIndex = NUMBER_SUFFIXES.indexOf(letter ?? "");
    if (multIndex < 0) return null;

    return Number(numStr) * 1000 ** multIndex;
}
