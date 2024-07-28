import { NS } from "@ns";
import { col } from "/lib/termcol";
import { dynamicImport } from "/lib/lib";

type Awaitable<T> = T | Promise<T>;

export class TestError extends Error {
    constructor(readonly message: string) {
        super(message);
    }
}

type TestReturn = { success: true; meta?: any } | { success: false; error: TestError };

interface Test {
    name: string;
    run(): Awaitable<TestReturn>;
}

export class BasicTest implements Test {
    constructor(
        readonly ns: NS,
        readonly name: string,
        readonly callback: () => Awaitable<void>,
    ) {}

    public async run(): Promise<TestReturn> {
        try {
            await this.callback();
            return { success: true };
        } catch (e) {
            let error: TestError;
            if (e instanceof TestError) {
                error = e;
            } else if (e instanceof Error) {
                console.error(e);
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

export class TimingTest implements Test {
    constructor(
        readonly ns: NS,
        readonly name: string,
        readonly callback: () => Awaitable<void>,
        readonly iterations: number,
    ) {}

    public async run(): Promise<TestReturn> {
        try {
            const times: number[] = [];
            for (let i = 0; i < this.iterations; i++) {
                const now = Date.now();
                await this.callback();
                const time = Date.now() - now;

                times.push(time);
            }

            return {
                success: true,
                meta: { times },
            };
        } catch (e) {
            let error: TestError;
            if (e instanceof TestError) {
                error = e;
            } else if (e instanceof Error) {
                error = new TestError(e.message);
                console.error(e);
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

interface TestRunOptions {
    filter?: string;
}

interface TestFailedResult {
    name: string;
    success: false;
    time: number;
    type: "timing" | "default";
    error: TestError;
}

interface TimingTestSuccessResult {
    name: string;
    success: true;
    type: "timing";
    time: number;
    min: number;
    avg: number;
    max: number;
}

interface DefaultTestSuccessResult {
    name: string;
    success: true;
    type: "default";
    time: number;
}

type TestResult = TestFailedResult | TimingTestSuccessResult | DefaultTestSuccessResult;

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
        this.tests.push(new BasicTest(this.ns, name, callback));
    }

    async time(name: string, callback: () => Awaitable<void>, iterations: number) {
        this.tests.push(new TimingTest(this.ns, name, callback, iterations));
    }

    async *run(options: TestRunOptions): AsyncGenerator<TestResult> {
        const { filter } = options;
        await this.beforeAllCallback?.();

        for (const test of this.tests) {
            if (filter && filter.length > 0 && !test.name.includes(filter)) continue;
            await this.beforeEachCallback?.();

            const type = test instanceof TimingTest ? "timing" : ("default" as const);
            const name = test.name;

            try {
                const before = Date.now();
                const result = await test.run();
                const time = Date.now() - before;

                if (!result.success) {
                    yield {
                        success: false,
                        name,
                        type,
                        error: result.error,
                        time,
                    };
                } else {
                    if (type === "timing") {
                        const times: number[] = result.meta.times;

                        let sum = 0;
                        let min = Infinity;
                        let max = 0;

                        for (const time of times) {
                            sum += time;
                            if (time < min) min = time;
                            if (time > max) max = time;
                        }

                        const avg = sum / times.length;

                        yield {
                            name,
                            success: true,
                            type,
                            time,
                            min,
                            avg,
                            max,
                        };
                    } else {
                        yield { name, success: true, type, time };
                    }
                }
            } catch (e) {
                let message = "";
                if ((e as any)?.message) {
                    message += `${col().red((e as any).message)}. Check console for details.`;
                } else {
                    message += `Unknown error. Check console for details.`;
                }

                yield {
                    name,
                    success: false,
                    type,
                    time: 0,
                    error: new TestError(message),
                };
            }
            await this.afterEachCallback?.();
        }

        await this.afterAllCallback?.();
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
