export function lzDecompress(data: string) {
    const chars = data.split("");

    let chunkLength;
    let out = "";

    let copy = true;

    while (chars.length > 0) {
        chunkLength = Number(chars.shift());

        if (chunkLength == 0) {
            copy = !copy;
            continue;
        }

        if (copy) {
            while (chunkLength > 0) {
                out += chars.shift();
                chunkLength--;
            }
        } else {
            const jumpBy = Number(chars.shift());
            if (isNaN(jumpBy))
                throw new Error(
                    `NaN jumpBy in ${data} at index ${data.length - chars.length}.`,
                );

            while (chunkLength > 0) {
                out += out[out.length - jumpBy];
                chunkLength--;
            }
        }

        copy = !copy;
    }

    return out;
}
