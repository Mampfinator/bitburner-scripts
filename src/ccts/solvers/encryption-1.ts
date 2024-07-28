const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function solve(data: [string, number]) {
    const [plainText, shiftBy] = data;
    let outText = "";

    for (let i = 0; i < plainText.length; i++) {
        let index = ALPHABET.indexOf(plainText[i]);

        if (index == -1) {
            outText += plainText[i];
            continue;
        }

        index -= shiftBy;

        if (index < 0) index += ALPHABET.length * Math.abs(Math.floor(index / ALPHABET.length));

        outText += ALPHABET[index];
    }

    return outText;
}

export const contractType = "Encryption I: Caesar Cipher";
