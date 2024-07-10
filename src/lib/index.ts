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
