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
import { load as loadTime } from "./compress-time";
import { load as loadDependencies } from "./dependencies";
import { compressTime } from "./compress-time";
import { ServerCache } from "/lib/servers/server-cache";

export async function load(ns: NS) {
    await loadDependencies(ns);

    console.log("Loading system namespace...");

    await loadTime(ns);
    compressTime(-1);

    globalThis.system ??= {} as any;

    await loadEvents(ns);

    globalThis.servers = ServerCache.instance;

    await loadMemory(ns);
    await loadProc(ns);

    console.log(`System namespace loaded: `, globalThis.system);
}
