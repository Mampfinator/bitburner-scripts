import { TestContext } from "../test-context";

export async function test(ctx: TestContext) {
    ctx.test("unformatNumber", async () => {
        const { unformatNumber } = await ctx.import<typeof import("lib/lib")>("lib/lib");

        const n = Math.ceil(Math.random() * 100000);

        const formatted = ctx.ns.formatNumber(n);
        const unformatted = unformatNumber(formatted);

        ctx.assertEq(unformatted, n);
    });
}