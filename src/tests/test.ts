import { NS } from "@ns";

export async function main(ns: NS) {
    ns.disableLog("ALL");
    // TODO: Add tests. We can probably load them dynamically from a subdirectory with the dynamic import hack.
    // Tests should export a single `test` function that takes `NS` as an argument.
}
