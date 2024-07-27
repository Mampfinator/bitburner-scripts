import { NS } from "@ns";
import { auto } from "/system/proc/auto";

export async function main(ns: NS) {
    auto(ns);
    const contractType = ns.args.map(String).join(" ");

    try {
        const filename = ns.codingcontract.createDummyContract(contractType);

        navigator.clipboard.writeText(filename);
        ns.tprint(`${filename} created and name copied to your clipboard!`);
    } catch {
        ns.tprint(`Something went wrong!`);
    }
}
