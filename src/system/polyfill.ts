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
