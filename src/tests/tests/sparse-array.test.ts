import { TestContext } from "../test-context";

export async function test(ctx: TestContext) {
    const iterations = 25;
    const size = 100_000;
    const remove = Math.floor(size * 0.25);

    const { SparseArray, SimpleSparseArray } = await ctx.import<typeof import("lib/lib")>("lib/lib.js");

    ctx.time(
        "Random: SparseArray",
        () => {
            const array = new SparseArray<number>();
            // @ts-expect-error
            for (let i = 0; i < size; i++) array.array[i] = 1;

            for (let i = 0; i < remove; i++) {
                array.remove(Math.floor(array.length * Math.random()));
            }

            for (let i = 0; i < remove; i++) {
                array.push(1);
            }
        },
        iterations,
    );

    ctx.time(
        "Random: Native Array (raw findIndex)",
        () => {
            const array: number[] = [];
            for (let i = 0; i < size; i++) array[i] = 1;

            for (let i = 0; i < remove; i++) {
                const index = ~~(array.length * Math.random());
                delete array[index];
            }

            for (let i = 0; i < remove; i++) {
                let index = array.findIndex((v) => v == undefined);
                if (index < 0) index = array.length;
                array[index] = 2;
            }
        },
        iterations,
    );

    ctx.time(
        "Random: SimpleSparseArray",
        () => {
            const array = new SimpleSparseArray<number>();
            for (let i = 0; i < size; i++) array[i] = 1;

            for (let i = 0; i < remove; i++) {
                const index = ~~(array.length * Math.random());
                array.delete(index);
            }

            for (let i = 0; i < remove; i++) {
                array.push(1);
            }
        },
        iterations,
    );

    ctx.time(
        "Assignment: Array Literal",
        () => {
            const array = [];
            for (let i = 0; i < 10000; i++) array[i] = 10;
        },
        1_000_000,
    );

    ctx.time(
        "Assignment: Array",
        () => {
            const array = new Array();
            for (let i = 0; i < 10000; i++) array[i] = 10;
        },
        1_000_000,
    );

    ctx.time(
        "Assignment: SimpleSparseArray",
        () => {
            const array = new SimpleSparseArray<number>();
            for (let i = 0; i < 10000; i++) array[i] = 10;
        },
        1_000_000,
    );
}
