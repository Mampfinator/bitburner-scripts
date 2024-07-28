export function solve(data: string) {
    return data
        .split("")
        .reduce(
            (acc, char) => {
                if (acc.length == 0) acc.unshift([char, 1]);
                else if (acc[0][0] !== char || acc[0][1] === 9) acc.unshift([char, 1]);
                else acc[0][1] += 1;

                return acc;
            },
            [] as [string, number][],
        )
        .reverse()
        .map(([char, count]) => `${count}${char}`)
        .join("");
}

export const contractType = "Compression I: RLE Compression";
