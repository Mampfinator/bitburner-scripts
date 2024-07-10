import { NS } from "@ns";

export async function main(ns: NS) {
    const contractType = ns.args.map(String).join(" ");

    try {
        const filename = ns.codingcontract.createDummyContract(contractType);

        navigator.clipboard.writeText(filename);
        ns.tprint(`${filename} created and name copied to your clipboard!`);
    } catch {
        ns.tprint(`Something went wrong!`);
    }
}
