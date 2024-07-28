import { NS } from "@ns";

/**
 * Omit function properties from an object.
 */
type OmitFunctions<T extends object> = {
    [K in keyof T]: T[K] extends Function ? never : T[K];
};

/**
 * Automagically save settings whenever they're modified.
 * Implementors should keep in mind that saves could happen frequently, depending on use case.
 *
 * **Very** important caveat: only `set` operations trigger saves. If your settings contain objects, these **do not** trigger
 * saves unless reassigned.
 */
// TODO: we ***might*** be able to apply the same proxy handler to assigned objects to make usage more straightforward
// So `if (typeof value === "object") target[property] = new Proxy(value, handler)`; else target[property] = value.
// There are, however, probably some caveats with this as well.
export abstract class Settings {
    protected loaded = false;
    protected loading = false;

    private readonly ignoreProperties: (string | symbol | number)[] = ["ignoreProperties", "loaded", "loading"];

    constructor(ignoreProperties?: (string | symbol | number)[]) {
        const o = {
            ignoreProperties: ["ignoreProperties", "loaded", "loading", ...(ignoreProperties ?? [])],
        } as unknown as Settings;
        Object.setPrototypeOf(o, new.target.prototype);

        // prevent setting `loaded` to true at the end of `load()` triggering a save.
        let loaded = o.loaded;

        const proxy = new Proxy(o, {
            set(target, property, value) {
                target[property as keyof typeof target] = value;
                if (loaded && !target.loading) target.save();

                loaded ||= o.loaded;

                return true;
            },
        });

        return proxy;
    }

    load(): void {
        this.loading = true;

        const data = this.doLoad();

        for (const [key, value] of Object.entries(data).filter(([key]) => !this.ignoreProperties.includes(key))) {
            this[key as keyof this] = value;
        }

        this.loaded = true;
        this.loading = false;
    }
    protected abstract doLoad(): OmitFunctions<Omit<this, "ns" | "filePath" | "loading">>;

    save(): void {
        if (!this.loaded) throw new Error(`Unloaded settings encountered. Did you forget to call load()?`);
        const copy = Object.assign({}, this);

        for (const key of this.ignoreProperties) {
            Reflect.deleteProperty(copy, key);
        }

        for (const key of Object.getOwnPropertyNames(copy).filter(
            (key) => typeof copy[key as keyof typeof copy] === "function",
        )) {
            Reflect.deleteProperty(copy, key);
        }

        this.doSave(copy as OmitFunctions<this>);
    }
    protected abstract doSave(data: OmitFunctions<this>): void;
}

/**
 * JSON-backed {@link Settings}.
 */
export abstract class JSONSettings extends Settings {
    constructor(
        private readonly ns: NS,
        private readonly filePath: string,
    ) {
        if (!filePath.endsWith(".json")) throw new Error(`Expected path to JSON file, got ${filePath}`);
        super(["ns", "filePath"]);
    }

    doLoad(): OmitFunctions<this> {
        let fileContent = this.ns.read(this.filePath);
        if (fileContent === "") fileContent = "{}";

        const file: OmitFunctions<this> = JSON.parse(fileContent);
        return file;
    }

    doSave(data: OmitFunctions<this>) {
        this.ns.write(this.filePath, JSON.stringify(data), "w");
    }
}
