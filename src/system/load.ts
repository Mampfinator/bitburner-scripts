//! Loads all system dependencies.
//! These currently include:
//! - events (globalThis.eventEmitter)
//! - memory management
//! - loading initial network state
import { NS } from "@ns";

import { load as loadEvents } from "./events";
import { load as loadMemory } from "./memory";
import { syncServers } from "./sync-servers";

export async function main(ns: NS) {
    globalThis.system ??= {} as any;

    await loadEvents(ns);
    await loadMemory(ns);
    syncServers(ns);

    ns.spawn("system/main.ts", { temporary: true, spawnDelay: 0 });
}
