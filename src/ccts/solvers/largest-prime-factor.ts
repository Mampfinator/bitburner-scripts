export function largestPrimeFactor(data: number) {
    const factors = [];
    let divisor = 2;

    while (data > 1) {
        while (data % divisor == 0) {
            factors.push(divisor);
            data /= divisor;
        }

        divisor += 1;
    }

    return factors.reduce((previous, current) => (current > previous ? current : previous), 0);
}
