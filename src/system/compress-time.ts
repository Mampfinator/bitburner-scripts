import { NS } from "@ns";

declare global {
    /**
     * Original `setTimeout` function.
     */
    function originalSetTimeout(
        h: TimerHandler,
        t: number | undefined,
        ...args: any[]
    ): number;
}

function makeCompressedTimeout(divisor: number) {
    function compressedTimeout(
        h: TimerHandler,
        t: number | undefined,
        ...args: any[]
    ): number {
        const compressedTime = t ? Math.ceil(t / divisor) : t;
        return globalThis.originalSetTimeout(h, compressedTime, ...args);
    }

    compressedTimeout.divisor = divisor;

    return compressedTimeout;
}

/**
 * Returns the current compression factor. A factor of `1` means time is not currently compressed.
 */
export function getCompressionFactor(): number {
    return (globalThis.setTimeout as any).divisor ?? 1;
}

/**
 * Compress time. A negative `by` will result in all timeouts being completed instantly.
 */
export function compressTime(by: number) {
    if (by < 0) by = -1;
    if (
        globalThis.setTimeout.name === "compressedTimeout" ||
        (globalThis.setTimeout as any).divisor === by
    )
        return;

    const newTimeout = makeCompressedTimeout(by);

    globalThis.setTimeout = newTimeout;
}

/**
 * Uncompress time.
 */
export function uncompressTime() {
    if (globalThis.setTimeout.name === "setTimeout") return;
    globalThis.setTimeout = globalThis.originalSetTimeout;
}

export async function load(_: NS) {
    if (
        !globalThis.originalSetTimeout &&
        globalThis.setTimeout.name === "setTimeout"
    )
        globalThis.originalSetTimeout = setTimeout;
}
