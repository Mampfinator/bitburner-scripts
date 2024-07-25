import { type TestContext } from "../test-context";

export async function test(ctx: TestContext) {
    const { sleep } = await ctx.import<typeof import("lib/lib")>("lib/lib");
    const { compressTime, uncompressTime, getCompressionFactor } =
        await ctx.import<typeof import("system/compress-time")>(
            "system/compress-time",
        );

    ctx.beforeEach(() => {
        uncompressTime();
    });

    const originalFactor = getCompressionFactor();
    ctx.afterAll(() => {
        compressTime(originalFactor);
    });

    ctx.test("Arbitrarily compress time", async () => {
        const factor = 2;

        compressTime(factor);

        const now = Date.now();

        await sleep(1000, false);

        const sleptFor = Date.now() - now;

        const compressedBy = sleptFor / 1000;

        ctx.assert(
            // 5% error because of how timeouts work.
            Math.abs(compressedBy * factor - 1) < 0.05,
            `Expected to sleep for about 1s, slept for ${sleptFor}ms.`,
        );
    });

    ctx.test("Circumvent time compression in sleep", async () => {
        compressTime(-1);

        const sleepFor = 5000;

        const now = Date.now();

        await sleep(sleepFor, true);

        const sleptFor = Date.now() - now;

        ctx.assert(
            // 5% error because of how timeouts work.
            Math.abs(sleptFor / sleepFor - 1) < 0.05,
            `Expected to sleep for about ${sleepFor}ms, slept for ${sleptFor}ms.`,
        );
    });
}
