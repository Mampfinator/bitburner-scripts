import { NetscriptPort } from "@ns";

export function* readPort(port: NetscriptPort) {
    if (port.empty()) return;
    while (true) {
        const message = port.read();
        if (message === "NULL PORT DATA") return;
        yield message;
    }
}

/**
 * @returns a tuple of all `[passed, failed]` elements.
 */
export function splitFilter<T>(
    arr: T[],
    filterFn: (element: T, index: number) => boolean,
): [T[], T[]] {
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
    freeSlots = new Set<number>();

    constructor(from?: Iterable<T>) {
        if (from) this.array.push(...from);
    }

    public push(item: T): number {
        if (this.freeSlots.size === 0) {
            return this.array.push(item) - 1;
        }

        const slot = [...this.freeSlots].sort().shift()!;
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

    const units = ([
        [milliseconds, "ms"],
        [seconds, "s"], 
        [minutes, "m"], 
        [hours, "h"],
        [days, "d"]
    ] as const)
    .filter(([unit]) => unit > 0)
    .reverse();

    if (units.length === 0) return "0s";
    return units.map(input => input.join("")).join("");
}