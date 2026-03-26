export interface LatestBlockData {
	readonly blockhash: string;
	readonly lastValidBlockHeight: number;
}

let latest: LatestBlockData | null = null;

export function updateBlockData(data: LatestBlockData): void {
	latest = data;
}

export function getBlockData(): LatestBlockData | null {
	return latest;
}
