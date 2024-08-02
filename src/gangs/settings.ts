import { NS } from "@ns";
import { JSONSettings } from "/lib/settings";

export class GangSettings extends JSONSettings {
    constructor(ns: NS) {
        super(ns, "gang/settings.json");
    }

    /**
     * Faction to **automatically** start a gang with, if set.
     * Will wait for manual creation otherwise.
     */
    gangFaction: string | null = null;

    /**
     * Minimum chance to win the gang needs to participate in territory warfare.
     */
    territoryWarfareWinThreshold: number = 0.75;
}