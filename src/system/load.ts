//! Loads all system dependencies.
//! These currently include:
//! - events (globalThis.eventEmitter)
//! - memory management
//! - loading initial network state
import { NS } from "@ns";

import "system/polyfill";

import { load as loadEvents } from "./events";
import { load as loadMemory } from "./memory";
import { load as loadProc } from "./proc/processes";
import { syncServers } from "./sync-servers";
import { compressTime } from "./compress-time";
import { run } from "./proc/run";

export async function load(ns: NS) {
    console.log("Loading system namespace...");

    globalThis.system ??= {} as any;

    compressTime(100000000000);

    await loadEvents(ns);
    await loadMemory(ns);
    await loadProc(ns);
    syncServers(ns);

    console.log(`System namespace loaded: `, globalThis.system);

    run(ns, "system/main.js", { hostname: "home" });
}

export async function main(ns: NS) {
    load(ns);
}
