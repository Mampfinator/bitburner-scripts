export const INJECTABLE = Symbol("INJECTABLE");

export interface InjectableOptions {
    manual?: boolean;
}

const DEFAULT_OPTIONS: InjectableOptions = {
    manual: false
}

export const TYPE_REGISTRY = new Map<string | symbol | Function, any>();

export interface FullInjectableOptions extends InjectableOptions {
    token: symbol | string | Function;
}

export const Injectable = (options?: InjectableOptions): ClassDecorator => {
    return (target) => {
        Reflect.defineMetadata(
            INJECTABLE, 
            { ...DEFAULT_OPTIONS, ...(options ?? {}), token: target, }, 
            target
        );

        TYPE_REGISTRY.set(target, target);
    }
}
