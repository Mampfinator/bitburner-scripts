import { NS } from "@ns";

const {
    React: { useEffect },
} = globalThis;

type EventHandler = {
    event: string;
    handler: (...args: any[]) => void | Promise<void>;
};

export function useEvents(ns: NS, ...handlers: EventHandler[]): void;
export function useEvents(...handlers: EventHandler[]): void;
export function useEvents(
    nsOrHandler: NS | EventHandler,
    ...handlers: EventHandler[]
): void {
    const ns =
        "event" in nsOrHandler && "handler" in nsOrHandler
            ? undefined
            : nsOrHandler;
    useEffect(() => {
        const cleanupFns = [];
        if (!ns)
            cleanupFns.push(
                globalThis.eventEmitter.withCleanup(
                    (nsOrHandler as EventHandler).event,
                    (nsOrHandler as EventHandler).handler,
                    ns,
                ),
            );

        cleanupFns.push(
            ...handlers.map(({ event, handler }) =>
                globalThis.eventEmitter.withCleanup(event, handler, ns),
            ),
        );
    });
}
