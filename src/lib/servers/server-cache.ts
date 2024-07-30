//! This file contains everything to do with the global server cache.
//! It should **never** have a RAM cost above base (1.6GB) when inspected ingame.
import { ProcessInfo, Server } from "@ns";
import { getMemoryMap, MemInfo, register } from "/system/memory";
import { EventEmitter } from "/system/events";
import { ServerBridge } from "./server-provider";

declare global {
    var servers: ServerCache;
}

function isFullServer(server: Partial<Server>): server is Server {
    return Object.keys(server).length === 24;
}

const EMIT_ON_UPDATE = {
    hasAdminRights: "rooted",
    isBackdoorInstalled: "backdoor",
    maxRam: "ram-updated",
};

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

    constructor() {
        super();

        eventEmitter.on("server:rooted", (hostname) => {
            this.get(hostname)?.emit("rooted");
        });

        eventEmitter.on("server:backdoored", (hostname) => {
            this.get(hostname)?.emit("backdoored");
        });
    }

    private _bridge: ServerBridge | null = null;
    public get bridge(): ServerBridge | null {
        return this._bridge;
    }
    public setBridge(bridge: ServerBridge) {
        this._bridge = bridge;
    }

    /**
     * Update (or insert) a server in the cache.
     */
    public update(server: (Partial<Server> & { hostname: string }) | Server | string): boolean {
        if (typeof server === "string") {
            if (!this.bridge) return false;
            const fetchedServer = this.bridge.server(server);
            if (!fetchedServer) return false;
            server = fetchedServer;
        }

        if (this.has(server.hostname)) {
            this.get(server.hostname)!.update(server);
            return true;
        } else if (isFullServer(server)) {
            this.set(server.hostname, new ServerData(server, this));
            return true;
        }

        return false;
    }

    /**
     * Get a server from the cache.
     *
     * If possible, the server will be updated with the latest data.
     * If the server is not in the cache, it will be added if it exists.
     * Otherwise, `undefined` will be returned.
     */
    public get(key: string): ServerData | undefined {
        if (this.bridge) {
            const fetchedServer = this.bridge.server(key);
            if (!fetchedServer) return;
            let server: ServerData;
            if (this.has(key)) {
                server = super.get(key)!;
                server.update(fetchedServer);
            } else {
                const newServer = new ServerData(fetchedServer, this);
                this.set(key, newServer);
                server = newServer;
            }

            return server;
        }

        return super.get(key);
    }

    public *values(): IterableIterator<ServerData> {
        if (!this.bridge) return super.values();

        for (const value of super.values()) {
            const update = this.bridge.server(value.hostname);
            if (update) value.update(update);
            yield value;
        }
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
};

export class ServerData extends EventEmitter<ServerEvents> implements Server {
    private server: Server;

    constructor(
        server: Server,
        private cache: ServerCache,
    ) {
        super();
        this.server = { ...server };
        this.memInfo;
    }

    //#region server getters
    public get hostname(): string {
        return this.server.hostname;
    }
    public get ip(): string {
        return this.server.ip;
    }
    public get sshPortOpen(): boolean {
        return this.server.sshPortOpen;
    }
    public get ftpPortOpen(): boolean {
        return this.server.ftpPortOpen;
    }
    public get smtpPortOpen(): boolean {
        return this.server.smtpPortOpen;
    }
    public get httpPortOpen(): boolean {
        return this.server.httpPortOpen;
    }
    public get sqlPortOpen(): boolean {
        return this.server.sqlPortOpen;
    }
    public get hasAdminRights(): boolean {
        return this.server.hasAdminRights;
    }
    public get cpuCores(): number {
        return this.server.cpuCores;
    }
    public get isConnectedTo(): boolean {
        return this.server.isConnectedTo;
    }
    public get ramUsed(): number {
        return this.server.ramUsed;
    }
    public get maxRam(): number {
        return this.server.maxRam;
    }
    public get organizationName(): string {
        return this.server.organizationName;
    }
    public get purchasedByPlayer(): boolean {
        return this.server.purchasedByPlayer;
    }
    // I've only ever seen this return undefined for purchased servers, which are basically "backdoored" by default.
    public get backdoorInstalled(): boolean {
        return this.server.backdoorInstalled ?? true;
    }
    public get baseDifficulty(): number {
        return this.server.baseDifficulty ?? 0;
    }
    public get hackDifficulty(): number {
        return this.server.hackDifficulty ?? 0;
    }
    public get minDifficulty(): number {
        return this.server.minDifficulty ?? 0;
    }
    public get moneyAvailable(): number {
        return this.server.moneyAvailable ?? 0;
    }
    public get moneyMax(): number {
        return this.server.moneyMax ?? 0;
    }
    public get numOpenPortsRequired(): number {
        return this.server.numOpenPortsRequired ?? 0;
    }
    public get openPortCount(): number {
        return this.server.openPortCount ?? 0;
    }
    public get requiredHackingSkill(): number {
        return this.server.requiredHackingSkill ?? 0;
    }
    public get serverGrowth(): number {
        return this.server.serverGrowth ?? 0;
    }
    //#endregion

    get freeRam(): number {
        return this.maxRam - this.ramUsed;
    }

    public update(server: Partial<Server>) {
        for (const [key, value] of Object.entries(server) as [keyof Server, Server[keyof Server]][]) {
            if (value === undefined || !(key in this.server)) continue;
            if (key in EMIT_ON_UPDATE && this.server[key] !== value) {
                globalThis.eventEmitter.emit(
                    `server:${EMIT_ON_UPDATE[key as keyof typeof EMIT_ON_UPDATE]}`,
                    this.hostname,
                    value,
                    this[key as keyof this],
                );
            }

            Reflect.set(this, key, value);
        }
        register(this);
    }

    /**
     * Ensure this server is up to date.
     */
    public refetch(): boolean {
        const refetched = this.cache.bridge?.server(this.hostname);
        if (!refetched) return false;

        this.update(refetched);
        return true;
    }

    private _processes: ProcessInfo[] | null = null;
    public get processes(): ProcessInfo[] {
        return this._processes ?? [];
    }

    /**
     * Whether this server is a Hacknet server.
     */
    public get isHacknetServer(): boolean {
        return /hacknet\-server\-\d+/.test(this.hostname);
    }

    private _memInfo: MemInfo | null = null;
    public get memInfo(): MemInfo {
        if (!this._memInfo) {
            this._memInfo = getMemoryMap().get(this.hostname) ?? register(this)[1];
            this._memInfo?.update(this);
        }

        return this._memInfo!;
    }

    /**
     * Backdoor this server.
     *
     * @returns Whether installing the backdoor was successful or not.
     */
    async backdoor(): Promise<boolean> {
        if (this.backdoorInstalled) return true;
        if (!this.hasAdminRights) return false;
        const success = (await this.cache.bridge?.backdoor(this.hostname)) ?? false;

        this.update({ backdoorInstalled: success });
        if (success) globalThis.eventEmitter.emit("server:backdoored", this.hostname);
        return success;
    }

    /**
     * Connect to this server via `singularity`.
     *
     * @returns Whether connecting was successful, and if so, a function to go back to the original server.
     */
    public connectTo(): [connected: boolean, goBack: () => void] {
        if (!this.cache.bridge) return [false, () => {}];
        const [connected, goBack] = this.cache.bridge.connectTo(this.hostname);
        this.update({ isConnectedTo: connected });
        return [connected, goBack];
    }

    /**
     * Root (aka "nuke") this server.
     */
    public root(): boolean {
        if (this.hasAdminRights) return true;
        const success = this.cache.bridge?.root(this.hostname) ?? false;

        this.update({ hasAdminRights: success });
        if (success) {
            globalThis.eventEmitter.emit("server:rooted", this.hostname);
        }
        return success;
    }
}
