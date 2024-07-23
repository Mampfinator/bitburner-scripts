//! Loads all system dependencies.
//! These currently include:
//! - events (globalThis.eventEmitter)
//! - memory management
//! - loading initial network state
import { NS } from "@ns";

import { load as loadEvents } from "./events";
import { load as loadMemory } from "./memory";
import { load as loadProc } from "./proc/processes";
import { syncServers } from "./sync-servers";
import { compressTime } from "./compress-time";

export async function main(ns: NS) {
    globalThis.system ??= {} as any;

    compressTime(100000000000);

    await loadEvents(ns);
    await loadMemory(ns);
    await loadProc(ns);
    syncServers(ns);

    await ns.asleep(1000);

    ns.spawn("system/main.js", { temporary: true, spawnDelay: 0 });
}
