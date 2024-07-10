//! This script scans through all servers and attempts to automatically solve any coding contracts it finds.
import { NS } from "@ns";
import { findCcts } from "ccts/find.js";
// TODO: there might be a way to make dynamic imports work now that relative imports are supported.
// Alternatively, we could `ns.ls`, `ns.readFile` & `eval`, since we're not using any NS functions in the actual solvers.
import { solveEncryption1 } from "ccts/encryption-1.js";
import { vigenereEncrypt } from "ccts/encryption-2.js";
import { generateIps } from "ccts/generate-ips.js";
import { largestPrimeFactor } from "ccts/largest-prime-factor.js";
import { runLengthEncode } from "ccts/compression-1.js";
import { lzDecompress } from "ccts/compression-2.js";

export async function main(ns: NS) {
    while (true) {
        const ccts = findCcts(ns);

        for (const [hostname, filename] of ccts) {
            const type = ns.codingcontract.getContractType(filename, hostname);
            const data = ns.codingcontract.getData(filename, hostname);

            let solution = null;

            if (type === "Encryption I: Caesar Cipher") {
                solution = solveEncryption1(data);
            } else if (type === "Encryption II: Vigenère Cipher") {
                solution = vigenereEncrypt(data);
            } else if (type === "Generate IP Addresses") {
                solution = generateIps(data);
            } else if (type === "Find Largest Prime Factor") {
                solution = largestPrimeFactor(data);
            } else if (type === "Compression I: RLE Compression") {
                solution = runLengthEncode(data);
            } else if (type === "Compression II: LZ Decompression") {
                solution = lzDecompress(data);
            } else {
                ns.print(
                    `Not solving ${type} - ${hostname}:${filename} because no solver is available.`,
                );
                continue;
            }

            const attemptText = ns.codingcontract.attempt(
                solution,
                filename,
                hostname,
            );

            if (attemptText.length === 0) {
                ns.toast(
                    `Failed to solve ${type} - ${hostname}:${filename}. ${ns.codingcontract.getNumTriesRemaining(filename, hostname)} tries remaining.`,
                    "error",
                );
            } else {
                ns.toast(
                    `Solved ${hostname}:${filename}: ${attemptText}`,
                    "success",
                    60000,
                );
            }
        }

        // sleep 5 minutes
        await ns.sleep(1000 * 60 * 5);
    }
}
