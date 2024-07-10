/**
 * Check if the Character is letter or not
 * @param {string} str - character to check
 */
function isLetter(str: string) {
    return str.length === 1 && str.match(/[a-zA-Z]/i);
}

/**
 * Check if is Uppercase or Lowercase
 * @param {string} character - character to check
 * @return {boolean} result of the checking
 */
function isUpperCase(character: string) {
    return character === character.toUpperCase();
}

/**
 * Encrypt a Vigenere cipher
 * @param {string} message - string to be encrypted
 * @param {string} key - key for encrypt
 * @return {string} result - encrypted string
 */
export function vigenereEncrypt([message, key]: [string, string]) {
    let result = "";

    for (let i = 0, j = 0; i < message.length; i++) {
        const c = message.charAt(i);
        if (isLetter(c)) {
            if (isUpperCase(c)) {
                result += String.fromCharCode(
                    ((c.charCodeAt(0) +
                        key.toUpperCase().charCodeAt(j) -
                        2 * 65) %
                        26) +
                        65,
                ); // A: 65
            } else {
                result += String.fromCharCode(
                    ((c.charCodeAt(0) +
                        key.toLowerCase().charCodeAt(j) -
                        2 * 97) %
                        26) +
                        97,
                ); // a: 97
            }
        } else {
            result += c;
        }
        j = ++j % key.length;
    }
    return result;
}
