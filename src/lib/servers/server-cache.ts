import { ProcessInfo, Server } from "@ns";
import { getMemoryMap, MemInfo, register } from "/system/memory";
import { EventEmitter } from "/system/events";

declare global {
    var serverCache: ServerCache;
}

function isFullServer(server: Partial<Server>): server is Server {
    return Object.keys(server).length === 24;
}

/**
 * **Singleton** cache for servers and their related info.
 */
export class ServerCache extends Map<string, ServerData> {
    private static _instance: ServerCache | null = null;
    public static get instance(): ServerCache {
        if (!this._instance) {
            this._instance = new ServerCache();
        }

        return this._instance!;
    }

    /**
     * Update (or insert) a server in the cache.
     */
    public update(server: (Partial<Server> & { hostname: string }) | Server): boolean {
        if (this.has(server.hostname)) {
            this.get(server.hostname)!.update(server);
            return true;
        } else if (isFullServer(server)) {
            this.set(server.hostname, new ServerData(server));
            return true;
        }

        return true;
    }
}

type Awaitable<T> = T | Promise<T>;

export type ServerEvents = {
    /**
     * Emitted when this server is rooted.
     */
    rooted: () => Awaitable<void>;

    /**
     * Emitted when this server is backdoored.
     */
    backdoored: () => Awaitable<void>;
    
    /**
     * Emitted when a process on this server is killed.
     */
    processKilled: (pid: number) => Awaitable<void>;

    /**
     * Emitted when a process on this server is started.
     */
    processStarted: (pid: number) => Awaitable<void>;
}

// TODO: figure out if `Server`s returned from `ns.getServer` can be modified.
export class ServerData extends EventEmitter<ServerEvents> implements Server {
    constructor(
        private server: Server,
    ) {
        super();
        this.memInfo;
    }

    //#region server getters
    public get hostname(): string { return this.server.hostname; }
    public get ip(): string { return this.server.ip; }
    public get sshPortOpen(): boolean { return this.server.sshPortOpen; }
    public get ftpPortOpen(): boolean { return this.server.ftpPortOpen; }
    public get smtpPortOpen(): boolean { return this.server.smtpPortOpen; }
    public get httpPortOpen(): boolean { return this.server.httpPortOpen; }
    public get sqlPortOpen(): boolean { return this.server.sqlPortOpen; }
    public get hasAdminRights(): boolean { return this.server.hasAdminRights; }
    public get cpuCores(): number { return this.server.cpuCores; }
    public get isConnectedTo(): boolean { return this.server.isConnectedTo; }
    public get ramUsed(): number { return this.server.ramUsed; }
    public get maxRam(): number { return this.server.maxRam; }
    public get organizationName(): string { return this.server.organizationName; }
    public get purchasedByPlayer(): boolean { return this.server.purchasedByPlayer; }
    // I've only ever seen this return undefined for purchased servers, which are basically "backdoored" by default.
    public get backdoorInstalled(): boolean { return this.server.backdoorInstalled ?? true; }
    public get baseDifficulty(): number { return this.server.baseDifficulty ?? 0; }
    public get hackDifficulty(): number { return this.server.hackDifficulty ?? 0; }
    public get minDifficulty(): number { return this.server.minDifficulty ?? 0; }
    public get moneyAvailable(): number { return this.server.moneyAvailable ?? 0; }
    public get moneyMax(): number { return this.server.moneyMax ?? 0; }
    public get numOpenPortsRequired(): number { return this.server.numOpenPortsRequired ?? 0; }
    public get openPortCount(): number { return this.server.openPortCount ?? 0; }
    public get requiredHackingSkill(): number { return this.server.requiredHackingSkill ?? 0; }
    public get serverGrowth(): number { return this.server.serverGrowth ?? 0; }
    //#endregion

    public update(server: Partial<Server>) {
        this.server = {...this.server, ...server};
        register(this);
    }

    private _processes: ProcessInfo[] | null = null;
    public get processes(): ProcessInfo[] {
        return this._processes ?? [];
    }

    /**
     * Whether this server is a Hacknet server.
     */
    public get isHacknetServer(): boolean { return /hacknet\-server\-\d+/.test(this.hostname) }

    private _memInfo: MemInfo | null = null;
    public get memInfo(): MemInfo {
        if (!this._memInfo) {
            this._memInfo = getMemoryMap().get(this.hostname) ?? register(this)[1];
            this._memInfo!.update(this);
        }

        return this._memInfo!;
    }
}