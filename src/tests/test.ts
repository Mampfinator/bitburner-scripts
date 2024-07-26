import { AutocompleteData, NS, ScriptArg } from "@ns";
import { TestContext } from "./test-context";
import { col } from "/lib/termcol";
import { dynamicImport, pluralize, splitFilter } from "/lib/lib";

type Awaitable<T> = T | Promise<T>;

const FLAGS = [
    ["scripts", [] as string[]],
    ["filter", ""],
] as [string, string | number | boolean | string[]][];

export function autocomplete(data: AutocompleteData, args: ScriptArg[]) {
    if (args.at(-2) === "--scripts") {
        return data.scripts.filter(file => file.endsWith(".test.js"));
    } else {
        data.flags(FLAGS);
        return [];
    }
}

export async function main(ns: NS) {
    ns.disableLog("ALL");

    const { scripts, filter } = ns.flags(FLAGS) as {
        scripts?: string[];
        filter: string;
    };

    const scriptNames =
        scripts && scripts.length > 0
            ? scripts
            : ns.ls(ns.getHostname(), ".test.js");
    ns.tprint(
        `Running ${scriptNames.length} ${pluralize("test suite", "test suites", scriptNames.length)}...`,
    );

    let success = 0;
    let failure = 0;

    for (const scriptName of scriptNames) {
        const ctx = new TestContext(ns);
        const { test } = await dynamicImport<{
            test: (ctx: TestContext) => Awaitable<void>;
        }>(ns, scriptName);

        try {
            await test(ctx);

            ns.tprint(
                `Running ${ctx.tests.filter((t) => t.name.includes(filter)).length} ${pluralize("test", "tests", ctx.tests.length)} in ${col().yellow(scriptName)}:`,
            );

            for await (const result of ctx.run({ filter })) {
                if (!result.success) {
                    const { name, time, error } = result;
                    ns.tprint(
                        `${" ".repeat(4)}${col().red("x")} ${name} (${time}ms): ${col().red(error.message)}`,
                    );

                    failure++;
                    continue;
                }

                success++;

                if (result.type === "timing") {
                    const { name, min, avg, max } = result;
                    ns.tprint(
                        `${" ".repeat(4)}${col().cyan("✓")} ${name} (${min}ms min./${avg}ms avg./${max}ms max.)`,
                    );
                } else if (result.type === "default") {
                    const { name, time } = result;
                    ns.tprint(
                        `${" ".repeat(4)}${col().cyan("✓")} ${name} (${time}ms)`,
                    );
                }
            }
        } catch (e) {
            ns.tprint(
                col().red(
                    `Test ${col().yellow(scriptName)} threw an unknown error. Check the console for details.`,
                ),
            );
            console.error(e);
            failure += ctx.tests?.length ?? 1;
        }
    }

    ns.tprint(
        `${col().cyan(success)} ${pluralize("test", "tests", success)} succeeded, ${col().red(failure)} ${pluralize("test", "tests", failure)} failed.`,
    );
}
