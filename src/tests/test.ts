import { NS } from "@ns";
import { TestContext } from "./test-context";
import { col } from "/lib/termcol";
import { dynamicImport, pluralize, splitFilter } from "/lib/lib";

type Awaitable<T> = T | Promise<T>;

export async function main(ns: NS) {
    ns.disableLog("ALL");

    const { scripts } = ns.flags([
        ["scripts", []],
    ]) as {
        scripts?: string[],
    };

    const scriptNames = (scripts && scripts.length > 0) ? scripts : ns.ls(ns.getHostname(), ".test.js");
    ns.tprint(`Running ${scriptNames.length} ${pluralize("test suite", "test suites", scriptNames.length)}...`);

    let success = 0;
    let failure = 0;

    for (const scriptName of scriptNames) {
        const ctx = new TestContext(ns);
        const { test } = await dynamicImport<{
            test: (ctx: TestContext) => Awaitable<void>;
        }>(ns, scriptName);

        try {
            await test(ctx);

            ns.tprint(`Running ${ctx.tests.length} ${pluralize("test", "tests", ctx.tests.length)} in ${col().yellow(scriptName)}:`);
            const results = await ctx.run(2);

            const [succeeded, failed] = splitFilter(results, (result) => result.success);
            success += succeeded.length;
            failure += failed.length;
        } catch (e) {
            ns.tprintRaw(
                col().red(
                    `Test ${col().yellow(scriptName)} threw an unknown error. Check the console for details.`,
                ),
            );
            console.error(e);
            failure += ctx.tests?.length ?? 1; 
        }
    }

    ns.tprint(`${col().cyan(success)} ${pluralize("test", "tests", success)} succeeded, ${col().red(failure)} ${pluralize("test", "tests", failure)} failed.`);
}
