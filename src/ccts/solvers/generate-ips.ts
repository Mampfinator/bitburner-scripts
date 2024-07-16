function isValid(ip: string) {
    return !ip
        .split(".")
        .some(
            (octet) =>
                Number(octet) > 255 ||
                (octet.length > 1 && octet.startsWith("0")),
        );
}

export function solve(data: string) {
    let l = data.length;

    // Check for string size
    if (l > 12 || l < 4) {
        return [];
    }

    let check = data;
    const answer = new Array();

    // Generating different combinations.
    for (let i = 1; i < l - 2; i++) {
        for (let j = i + 1; j < l - 1; j++) {
            for (let k = j + 1; k < l; k++) {
                check =
                    check.substring(0, k) +
                    "." +
                    check.substring(k, check.length);
                check =
                    check.substring(0, j) +
                    "." +
                    check.substring(j, check.length);
                check =
                    check.substring(0, i) +
                    "." +
                    check.substring(i, check.length);

                // Check for the validity of combination
                if (isValid(check)) {
                    answer.push(check);
                }
                check = data;
            }
        }
    }

    return answer;
}

export const contractType = "Generate IP Addresses";
