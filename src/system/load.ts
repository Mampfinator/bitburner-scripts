//! Loads all system dependencies.
//! These currently include:
//! - events (globalThis.eventEmitter)
//! - memory management
//! - loading initial network state
import { NS } from "@ns";
import { load as loadEvents } from "./events";
import { load as loadMemory } from "./memory";
import { load as loadProc } from "./proc/processes";
import { load as loadTime } from "./compress-time";
import { load as loadDependencies } from "./dependencies";
import { compressTime } from "./compress-time";
import { ServerCache } from "/lib/servers/server-cache";
import { JSONSettings } from "/lib/settings";
import { init } from "wasm/bitburner_scripts";

class CoreSettings extends JSONSettings {
    constructor(ns: NS) {
        super(ns, "/settings/core.json");
    }

    public timeCompressionFactor: number = -1;
}

export async function load(ns: NS) {
    using settings = new CoreSettings(ns);
    settings.load();

    await loadDependencies(ns);

    console.log("Loading system namespace...");

    await loadTime(ns);
    compressTime(settings.timeCompressionFactor);

    const system = {} as (typeof globalThis)["system"];

    await loadEvents(ns);

    globalThis.servers = ServerCache.instance;

    await loadMemory(ns, system);
    await loadProc(ns, system);

    await init(ns);

    console.log(`System namespace loaded: `, system);
    globalThis.system = system;
}
