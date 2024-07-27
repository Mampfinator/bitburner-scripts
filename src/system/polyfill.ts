import * as ReactFlowNS from "reactflow";

declare global {
    var ReactFlow: typeof ReactFlowNS;
}

declare global {
    interface PromiseConstructor {
        withResolvers<T>(): {
            promise: Promise<T>;
            resolve: (value: T | PromiseLike<T>) => void;
            reject: (reason: any) => void;
        };
    }
}

Promise.withResolvers ??= function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void = () => {};
    let reject: (reason?: any) => void = () => {};

    return {
        promise: new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        }),
        resolve,
        reject,
    };
};

Object.groupBy ??= (<T>(arr: T[], callback: (...args: any[]) => string) => {
    return arr.reduce<Record<string, T[]>>((acc = {}, ...args) => {
        const key = callback(...args);
        acc[key] ??= [];
        acc[key].push(args[0]);
        return acc;
    }, {});
}) as any;

export default {};
