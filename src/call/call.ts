import { NS } from "@ns";
/**
 * Split a string `S` into an tuple of strings separated by the delimiter `D` (defaults to `.`).
 */
export type Split<S extends string, D extends string = "."> = S extends `${infer T}${D}${infer U}`
    ? [T, ...Split<U, D>]
    : [S];
/**
 * Construct a tuple of `N` elements of type `T`.
 */
export type Tuple<T, N extends number, R extends any[] = any[]> = R["length"] extends N ? R : Tuple<T, N, [T, ...R]>;
/**
 * Shift one element off the beginning of a tuple.
 */
export type Shifted<T extends any[]> = T extends [any, ...infer U] ? U : never;
/**
 * Get the value at the specified path in an object.
 */
export type Index<T extends object, I extends Tuple<keyof T, number>> = I["length"] extends 1
    ? T[I[0]]
    : Index<T[I[0]], Shifted<I>>;

function recursiveIndex<O extends object, P extends string>(object: O, path: P): Index<O, Split<P>> {
    const indices = path.split(".");
    return indices.reduce((obj: any, index: string) => obj?.[index], object) as unknown as Index<O, Split<P>>;
}

type Properties<T extends object> = T extends object ? Extract<keyof T, string> : never;

type PropertyPaths<T extends object> = {
    [K in Properties<T>]: T[K] extends object ? `${K}.${Properties<T[K]>}` : K;
}[Properties<T>];

type FilterFunctions<T extends object> = {
    [K in Properties<T>]: T[K] extends Function ? K : T[K] extends object ? FilterFunctions<T[K]> : never;
};

export type CallCommand = PropertyPaths<Omit<FilterFunctions<NS>, "args" | "enums">>;

/**
 * Dynamically call any NS function given its path in the NS object, and its arguments.
 */
export async function call<C extends CallCommand, F = Index<NS, Split<C>>>(
    ns: NS,
    command: C,
    ...args: F extends (...args: infer P) => unknown ? P : any[]
): Promise<F extends (...args: any[]) => infer R ? R : never> {
    const fn = recursiveIndex(ns, command);
    if (!fn || typeof fn !== "function") throw new Error(`Unknown command: ${command}`);
    return fn(...args);
}
