import { NS, Server } from "@ns";
import { getServers } from "./servers";
import { connect } from "./connect";
import { ServerGraph } from "./graph";
import { prepareNuke } from "../nuke";

type ServerCommands = {
    list: () => Server[];
    get: (payload: { hostname: string }) => Server | null;
    connectTo: (payload: { hostname: string; graph?: ServerGraph }) => [connected: boolean, goBack: () => void];
    backdoor: (payload: { hostname: string; graph?: ServerGraph }) => Promise<boolean>;
    root: (payload: { hostname: string }) => boolean;
};

class CommandBus<T extends Record<string, (...args: any[]) => any>> {
    public constructor(private commands: T) {}

    public dispatch<C extends keyof T>(
        command: C,
        ...payload: T[C] extends Function ? Parameters<T[C]> : never
    ): T[C] extends Function ? ReturnType<T[C]> : never {
        const dispatcher = this.commands[command];
        if (!dispatcher) throw new Error(`Unknown command: ${String(command)}`);
        return dispatcher(...payload);
    }
}

export class ServerBridge {
    constructor(private commands: CommandBus<ServerCommands>) {}

    /**
     * Get a server by its hostname.
     */
    public server(hostname: string): Server | null {
        return this.commands.dispatch("get", { hostname });
    }

    /**
     * List all servers.
     */
    public servers(): Server[] {
        return this.commands.dispatch("list");
    }

    /**
     * Backdoor a server.
     *
     * @returns Whether installing the backdoor was successful or not.
     */
    public backdoor(hostname: string, graph?: ServerGraph): Promise<boolean> {
        return this.commands.dispatch("backdoor", { hostname, graph });
    }

    /**
     * Connect to a server with `singularity`.
     *
     * @returns whether connecting to the server was successful or not, and a function to return to the original server.
     */
    public connectTo(hostname: string): [connected: boolean, goBack: () => void] {
        return this.commands.dispatch("connectTo", { hostname });
    }

    public root(hostname: string): boolean {
        return this.commands.dispatch("root", { hostname });
    }
}

/**
 * Provides access to server-related `NS` functionality without needing access to an `NS` instance.
 */
export class ServerProvider {
    private commands: CommandBus<ServerCommands>;

    constructor(private ns: NS) {
        this.commands = new CommandBus({
            list: () => {
                return getServers(ns);
            },
            get: ({ hostname }: { hostname: string }) => {
                try {
                    return this.ns.getServer(hostname) ?? null;
                } catch {
                    return null;
                }
            },
            connectTo: ({ hostname, graph }: { hostname: string; graph?: ServerGraph }) => {
                const [connected, originalGoBack] = connect(this.ns, hostname, graph);
                return [connected, () => originalGoBack?.(this.ns)];
            },
            backdoor: async ({ hostname, graph }: { hostname?: string; graph?: ServerGraph }) => {
                if (
                    (ns.getServer(hostname ?? ns.singularity.getCurrentServer()).requiredHackingSkill ?? 0) >
                    ns.getHackingLevel()
                )
                    return false;

                if (hostname) {
                    const [connected, goBack] = this.commands.dispatch("connectTo", { hostname, graph });
                    if (!connected) {
                        goBack();
                        return false;
                    }

                    try {
                        await ns.singularity.installBackdoor();
                        goBack();
                        return true;
                    } catch (e) {
                        console.error(e);
                        goBack();
                        return false;
                    }
                } else {
                    try {
                        await ns.singularity.installBackdoor();
                        return true;
                    } catch {
                        return false;
                    }
                }
            },
            root: ({ hostname }: { hostname: string }) => {
                prepareNuke(ns, hostname);
                try {
                    ns.nuke(hostname);
                    return ns.getServer(hostname).hasAdminRights;
                } catch {
                    return false;
                }
            },
        });
    }

    public get bridge(): ServerBridge {
        return new ServerBridge(this.commands);
    }
}
