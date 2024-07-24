import type * as ReactNamespace from "react";

declare global {
    interface PromiseConstructor {
        withResolvers<T>(): {
            promise: Promise<T>;
            resolve: (value: T | PromiseLike<T>) => void;
            reject: (reason: any) => void;
        };
    }
}

declare global {
    interface Global {
        React: typeof ReactNamespace;
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

export default {};
