export class MessageBus<TMessage = any, TReturn = void> {
    private rx: ((message: TMessage) => TReturn) | null = null;

    private readonly queue: TMessage[] = [];

    public send(message: TMessage) {
        if (!this.rx) {
            this.queue.push(message);
        } else {
            this.rx(message);
        }
    }

    public subscribe(rx: (message: TMessage) => TReturn) {
        this.rx = rx;

        while (this.queue.length > 0) {
            this.send(this.queue.shift()!);
        }
    }

    /**
     * @param rx if provided, only unsubscribes if the current handler matches the passed handler.
     */
    public unsubscribe(rx?: (message: TMessage) => TReturn) {
        if (rx) {
            if (Object.is(rx, this.rx)) {
                this.rx = null;
            }
        } else {
            this.rx = null;
        }
    }
}
