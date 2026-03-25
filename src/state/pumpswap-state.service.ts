import type { PumpSwapPoolState, PumpFeeTier, PoolStateHandler } from "../types";
import { TOKEN_DECIMALS } from "../config";
import { decodeTokenAccountBalance, decodePumpFeeConfig, selectFeeTier } from "../decoders";
import { pumpSwapGetPrice } from "../math";
import { log, formatPrice } from "../utils";

export class PumpSwapStateService implements PoolStateHandler {
	private state: PumpSwapPoolState | null = null;
	private feeTiers: readonly PumpFeeTier[] = [];
	private feeConfigPubkey: string | null = null;
	private reserves = new Map<string, bigint>();
	private pendingReserves = new Map<string, bigint>();
	private updateTracker = new Set<string>();

	init(state: PumpSwapPoolState, feeTiers: readonly PumpFeeTier[], feeConfigPubkey: string): void {
		this.state = state;
		this.feeTiers = feeTiers;
		this.feeConfigPubkey = feeConfigPubkey;
		this.state.price = this.calcPrice();
		this.reserves.set(state.baseVault, state.baseReserve);
		this.reserves.set(state.quoteVault, state.quoteReserve);
	}

	isSubscribed(pubkey: string): boolean {
		if (!this.state) return false;
		return pubkey === this.state.baseVault || pubkey === this.state.quoteVault || pubkey === this.feeConfigPubkey;
	}

	handleUpdate(pubkey: string, data: Buffer): boolean {
		if (!this.state) return false;

		if (pubkey === this.feeConfigPubkey) {
			return this.applyFeeConfigUpdate(data);
		}

		return this.applyVaultUpdate(pubkey, data);
	}

	getState(): PumpSwapPoolState | null {
		return this.state;
	}

	getSubscriptionAddresses(): string[] {
		if (!this.state) return [];
		const addresses = [this.state.baseVault, this.state.quoteVault];
		if (this.feeConfigPubkey) addresses.push(this.feeConfigPubkey);
		return addresses;
	}

	// Geyser sends vault token account updates separately.
	// We buffer until both vaults are fresh before committing — avoids arb checks on stale half-state.
	private applyVaultUpdate(pubkey: string, data: Buffer): boolean {
		const balance = decodeTokenAccountBalance(data);
		if (balance === null) return false;

		const current = this.pendingReserves.get(pubkey) ?? this.reserves.get(pubkey);
		if (current === balance) return false;

		this.pendingReserves.set(pubkey, balance);
		this.updateTracker.add(pubkey);

		if (this.updateTracker.size < 2) return false;

		for (const [vault, bal] of this.pendingReserves) {
			this.reserves.set(vault, bal);
		}

		this.state!.baseReserve = this.reserves.get(this.state!.baseVault) ?? 0n;
		this.state!.quoteReserve = this.reserves.get(this.state!.quoteVault) ?? 0n;
		this.state!.price = this.calcPrice();
		if (this.feeTiers.length > 0) {
			this.state!.feeBps = selectFeeTier(this.feeTiers, this.state!.quoteReserve);
		}
		log.info(`[pumpswap] price=${formatPrice(this.state!.price, this.state!.baseSymbol, this.state!.quoteSymbol)}`);

		this.pendingReserves.clear();
		this.updateTracker.clear();
		return true;
	}

	private applyFeeConfigUpdate(data: Buffer): boolean {
		const tiers = decodePumpFeeConfig(data);
		if (tiers.length === 0) return false;

		this.feeTiers = tiers;
		if (this.state) {
			this.state.feeBps = selectFeeTier(tiers, this.state.quoteReserve);
			log.info(`[pumpswap] Fee tiers updated (${tiers.length} tiers)`);
		}
		return false; // fee change alone doesn't trigger arb scan
	}

	private calcPrice(): bigint {
		if (!this.state) return 0n;
		return pumpSwapGetPrice(
			this.state.baseReserve,
			this.state.quoteReserve,
			TOKEN_DECIMALS[this.state.baseSymbol],
			TOKEN_DECIMALS[this.state.quoteSymbol]
		);
	}
}
