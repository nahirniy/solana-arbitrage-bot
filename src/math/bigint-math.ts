export function sqrt(n: bigint): bigint {
	if (n < 0n) throw new Error("sqrt of negative");
	if (n < 2n) return n;

	let x = n;
	let y = (x + 1n) / 2n;
	while (y < x) {
		x = y;
		y = (x + n / x) / 2n;
	}
	return x;
}

export function abs(n: bigint): bigint {
	return n < 0n ? -n : n;
}

export function min(a: bigint, b: bigint): bigint {
	return a < b ? a : b;
}

export function max(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}
