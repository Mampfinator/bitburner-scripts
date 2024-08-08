import { FullInjectableOptions, INJECTABLE, TYPE_REGISTRY } from "./injectable";

export type Type<T> = { new (...args: any[]): T };

class DependencyGraph {
    /**
     * All nodes that are currently instantiable.
     */
    public readonly instantiable = new Set<string | symbol | Function>();

    readonly pending = new Set<string | symbol | Function>();
    
    readonly dependencies = new Map<string | symbol | Function, Set<string | symbol | Function>>();
    readonly dependents = new Map<string | symbol | Function, Set<string | symbol | Function>>();

    public addNode(node: string | symbol | Function, manual?: boolean) {
        this.pending.add(node);
        if (!manual) this.instantiable.add(node);
        if (!this.dependencies.has(node)) this.dependencies.set(node, new Set());
        if (!this.dependents.has(node)) this.dependents.set(node, new Set());
    }

    public setDependencies(target: string | symbol | Function, dependencies: (string | symbol | Function)[]) {
        // roots do not have dependencies.
        if (dependencies.length > 0) this.instantiable.delete(target);

        for (const dependency of dependencies) {
            this.addNode(dependency);
            this.dependencies.get(target)!.add(dependency);
            this.dependents.get(dependency)!.add(target);
        }
    }

    public resolve(dependency: string | symbol | Function) {
        const dependents = this.dependents.get(dependency);
        if (!dependents) return;

        this.instantiable.delete(dependency);
        this.pending.delete(dependency);

        for (const dependent of dependents) {
            this.dependencies.get(dependent)!.delete(dependency);
            if (this.dependencies.get(dependent)!.size === 0) this.instantiable.add(dependent);
        }
    }
}

function canHaveMetadata(target: unknown): target is Function | object {
    return typeof target === "function" || typeof target === "object";
}

export class DependencyInjector {
    private graph?: DependencyGraph;

    public readonly instances = new Map<string | symbol | Function, any>();

    /**
     * Build the dependency graph. This does **not** instantiate anything.
     */
    public async build(): Promise<void> {
        const types = [...TYPE_REGISTRY];

        const graph = this.graph = new DependencyGraph();

        while (types.length > 0) {
            const entry = types.shift();
            if (!entry) return;

            const [token, injectable] = entry;

            // injectable is not instanitable, so we can just store it.
            if (typeof injectable !== "function") {
                this.instances.set(token, injectable);
                continue;
            }

            const options: FullInjectableOptions = Reflect.getMetadata(INJECTABLE, injectable);
            graph.addNode(token, options.manual);

            // injectable is instantiable, so we need to add it to the dependency graph.
            const parameters: unknown[] = Reflect.getMetadata("design:paramtypes", injectable) ?? [];
            
            graph.setDependencies(
                token, 
                parameters.filter(parameter => 
                    canHaveMetadata(parameter) && 
                    Reflect.hasMetadata(INJECTABLE, parameter)
                ).map(parameter => (Reflect.getMetadata(INJECTABLE, parameter as Function) as FullInjectableOptions).token)
            );
        }
    }

    /**
     * Instantiate as much of the dependency graph as possible.
     * 
     * @returns `true` if all nodes were instantiated, `false` otherwise.
     */
    public async instantiate(): Promise<boolean> {
        if (!this.graph) throw new Error(`Cannot instantiate without building the dependency graph.`);

        let instantiable = [...this.graph.instantiable];

        while (instantiable.length > 0) {
            const token = instantiable.shift()!;
            if (!token) throw new Error(`Cannot instantiate without building the dependency graph.`);
            if (this.instances.has(token)) continue;

            const node = TYPE_REGISTRY.get(token)!;

            const options: FullInjectableOptions = Reflect.getMetadata(INJECTABLE, node) as FullInjectableOptions;
            if (options.manual) continue;

            const parameters = (Reflect.getMetadata("design:paramtypes", node) as unknown[] ?? [])
                .map(parameter => (Reflect.getMetadata(INJECTABLE, parameter as Function | object) as FullInjectableOptions).token)
                .map(token => [token, this.instances.get(token)]);

            parameters.forEach(([token, instance], index) => {
                if (instance === undefined) {
                    throw new Error(`Cannot resolve parameter ${index} (${String(token)}) of ${node.name ?? String(node)}.`);
                }
            });

            try {
                const instance = new node(...parameters.map(parameter => parameter[1]!));
                this.instances.set(node, instance);
                this.graph.resolve(node);
                instantiable = [...this.graph.instantiable];
            } catch (e) {
                throw new Error(`Failed to instantiate ${node.name ?? String(node)}: ${e}`);
            }
        }

        return this.graph.pending.size === 0;
    }

    public async provide<T extends Type<unknown>>(token: T, value: InstanceType<T>): Promise<void>;
    public async provide(token: string | symbol, value: any): Promise<void>;
    public async provide(token: string | symbol | Function, value: any): Promise<void> {
        if (!this.graph) throw new Error(`Cannot provide without building the dependency graph.`);
        this.instances.set(token, value);
        this.graph.resolve(token);

        await this.instantiate();
    }

    public async resolve<T>(token: any): Promise<T | undefined> {
        if (!this.graph) throw new Error(`Cannot resolve without building the dependency graph.`);
        return this.instances.get(token) as T | undefined;
    }
}