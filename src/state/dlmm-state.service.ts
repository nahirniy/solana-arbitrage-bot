import { PublicKey } from "@solana/web3.js";
import { BINS_PER_ARRAY, TOKEN_DECIMALS } from "../config";
import { decodeMeteoraPool, decodeMeteoraBinArray } from "../decoders";
import type { DlmmPoolState, DlmmBinArray, PoolStateHandler } from "../types";
import { deriveBinArrayPDA, log, formatPrice } from "../utils";
import { getBinPrice } from "../math";

export class DlmmStateService implements PoolStateHandler {
	private state: DlmmPoolState | null = null;
	private subscribedArrays = new Map<string, number>(); // pubkey -> array index
	private centerArrayIndex = 0;

	init(state: DlmmPoolState, binArrays: { pubkey: string; data: DlmmBinArray }[]): void {
		this.state = state;

		for (const { pubkey, data } of binArrays) {
			state.binArrays.set(data.index, data);
			this.subscribedArrays.set(pubkey, data.index);
		}

		this.centerArrayIndex = Math.floor(state.activeId / BINS_PER_ARRAY);
		this.state.price = this.calcPrice();
	}

	isSubscribed(pubkey: string): boolean {
		if (!this.state) return false;
		return this.state?.poolAddress === pubkey || this.subscribedArrays.has(pubkey);
	}

	handleUpdate(pubkey: string, data: Buffer): boolean {
		if (!this.state) return false;

		if (pubkey === this.state.poolAddress) {
			return this.applyPoolUpdate(data);
		}

		if (this.subscribedArrays.has(pubkey)) {
			return this.applyBinArrayUpdate(data);
		}

		return false;
	}

	getState(): DlmmPoolState | null {
		return this.state;
	}

	getSubscriptionAddresses(): string[] {
		const addresses = Array.from(this.subscribedArrays.keys());
		if (this.state) addresses.push(this.state.poolAddress);
		return addresses;
	}

	needsResubscription(): boolean {
		if (!this.state) return false;
		const currentCenter = Math.floor(this.state.activeId / BINS_PER_ARRAY);
		return currentCenter !== this.centerArrayIndex;
	}

	getResubscriptionPDAs(): PublicKey[] {
		if (!this.state) return [];

		const newCenter = Math.floor(this.state.activeId / BINS_PER_ARRAY);
		const indices = [newCenter - 1, newCenter, newCenter + 1];

		return indices.map((idx) => deriveBinArrayPDA(this.state!.poolAddress, idx));
	}

	applyResubscription(binArrays: { pubkey: string; data: DlmmBinArray }[]): void {
		if (!this.state) return;

		for (const [, idx] of this.subscribedArrays) {
			this.state.binArrays.delete(idx);
		}
		this.subscribedArrays.clear();

		for (const { pubkey, data } of binArrays) {
			this.state.binArrays.set(data.index, data);
			this.subscribedArrays.set(pubkey, data.index);
		}

		this.centerArrayIndex = Math.floor(this.state.activeId / BINS_PER_ARRAY);
	}

	private applyPoolUpdate(data: Buffer): boolean {
		if (!this.state) return false;

		const decoded = decodeMeteoraPool(this.state.poolAddress, data);
		if (!decoded) return false;

		const { activeId, feeParams } = decoded;
		if (
			this.state.activeId === activeId &&
			this.state.feeParams.volatilityAccumulator === feeParams.volatilityAccumulator &&
			this.state.feeParams.volatilityReference === feeParams.volatilityReference
		) {
			return false;
		}

		this.state.activeId = activeId;
		this.state.feeParams.volatilityAccumulator = feeParams.volatilityAccumulator;
		this.state.feeParams.volatilityReference = feeParams.volatilityReference;
		this.state.price = this.calcPrice();
		log.info(
			`[dlmm] price=${formatPrice(this.state.price, this.state.baseSymbol, this.state.quoteSymbol)} (activeId=${activeId})`
		);

		return true;
	}

	private applyBinArrayUpdate(data: Buffer): boolean {
		if (!this.state) return false;

		const decoded = decodeMeteoraBinArray(data);
		if (!decoded) return false;

		this.state.binArrays.set(decoded.index, decoded);
		return true;
	}

	private calcPrice(): bigint {
		if (!this.state) return 0n;
		const rawPrice = getBinPrice(this.state.activeId, this.state.binStep);
		const baseDec = TOKEN_DECIMALS[this.state.baseSymbol];
		const quoteDec = TOKEN_DECIMALS[this.state.quoteSymbol];
		const decimalDiff = quoteDec - baseDec;
		if (decimalDiff > 0) return rawPrice / BigInt(10 ** decimalDiff);
		if (decimalDiff < 0) return rawPrice * BigInt(10 ** -decimalDiff);
		return rawPrice;
	}
}
