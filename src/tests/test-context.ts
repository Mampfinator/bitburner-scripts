import { NS } from "@ns";
import { col } from "/lib/termcol";
import { dynamicImport } from "/lib/lib";

type Awaitable<T> = T | Promise<T>;

export class TestError extends Error {
    constructor(readonly message: string) {
        super(message);
    }
}

type TestResult = { success: true } | { success: false; error: TestError };

export class Test {
    constructor(
        readonly ns: NS,
        readonly name: string,
        readonly callback: () => Awaitable<void>,
    ) {}

    public async run(): Promise<TestResult> {
        try {
            await this.callback();
            return { success: true };
        } catch (e) {
            let error: TestError;
            if (e instanceof TestError) {
                error = e;
            } else if (e instanceof Error) {
                error = new TestError(e.message);
            } else {
                error = new TestError("Unknown error");
            }

            return {
                success: false,
                error,
            };
        }
    }
}

/**
 * Test context for one suite of tests.
 */
export class TestContext {
    private beforeAllCallback?: () => Awaitable<void>;
    private beforeEachCallback?: () => Awaitable<void>;
    private afterEachCallback?: () => Awaitable<void>;
    private afterAllCallback?: () => Awaitable<void>;

    readonly tests: Test[] = [];

    constructor(readonly ns: NS) {}

    public beforeAll(callback: () => Awaitable<void>) {
        this.beforeAllCallback = callback;
    }

    public beforeEach(callback: () => Awaitable<void>) {
        this.beforeEachCallback = callback;
    }

    public afterEach(callback: () => Awaitable<void>) {
        this.afterEachCallback = callback;
    }

    public afterAll(callback: () => Awaitable<void>) {
        this.afterAllCallback = callback;
    }

    async test(name: string, callback: () => Awaitable<void>) {
        this.tests.push(new Test(this.ns, name, callback));
    }

    async run(depth: number = 0): Promise<TestResult[]> {
        await this.beforeAllCallback?.();

        const results: TestResult[] = [];

        for (const test of this.tests) {
            await this.beforeEachCallback?.();
            try {
                const result = await test.run();

                results.push(result);

                if (!result.success) {
                    this.ns.tprint(
                        `${" ".repeat(depth * 2)}${col().red("x")} ${test.name}: ${col().red(result.error.message)}`,
                    );
                } else {
                    this.ns.tprint(
                        `${" ".repeat(depth * 2)}${col().cyan("✓")} ${test.name}`,
                    );
                }
            } catch (e) {
                let message = `${" ".repeat(depth * 2)}${col().red("x")} ${test.name}`;
                if ((e as any)?.message) {
                    message += `: ${col().red((e as any).message)}. Check console for details.`;
                } else {
                    message += `: Unknown error. Check console for details.`;
                }

                results.push({ success: false, error: new TestError(message) });
                this.ns.tprint(message);
            }
            await this.afterEachCallback?.();
        }

        await this.afterAllCallback?.();

        return results;
    }

    public async import<T = any>(path: string): Promise<T> {
        if (!path.endsWith(".js")) path += ".js";
        return (await dynamicImport(this.ns, path)) as T;
    }

    public assert(condition: boolean, message?: string) {
        if (!condition) {
            throw new TestError(message ?? "Assertion failed");
        }
    }

    public assertEq<T>(actual: T, expected: T, message?: string) {
        if (!Object.is(actual, expected)) {
            throw new TestError(
                message ??
                    `Comparison failed. Expected ${(expected as any)?.toString?.() ?? expected}, got ${(actual as any)?.toString?.() ?? actual}`,
            );
        }
    }
}
