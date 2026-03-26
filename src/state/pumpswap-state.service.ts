import type { PumpSwapPoolState, PumpFeeTier, PoolStateHandler } from "../types";
import { TOKEN_DECIMALS, FEE_CONFIG_UPDATE_INTERVAL_MS } from "../config";
import { decodeTokenAccountBalance, decodePumpFeeConfig, selectFeeTier } from "../decoders";
import { pumpSwapGetPrice } from "../math";
import { log, formatPrice } from "../utils";

export class PumpSwapStateService implements PoolStateHandler {
	private state: PumpSwapPoolState | null = null;
	private feeTiers: readonly PumpFeeTier[] = [];
	private feeConfigPubkey: string | null = null;
	private lastFeeConfigUpdate = 0;
	private reserves = new Map<string, bigint>();
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
	// Both vaults change atomically per swap, but Geyser may deliver them in separate messages.
	// We commit after both arrive, OR after any single change if the other vault already has a value.
	private applyVaultUpdate(pubkey: string, data: Buffer): boolean {
		const balance = decodeTokenAccountBalance(data);
		if (balance === null) return false;

		const current = this.reserves.get(pubkey);
		if (current === balance) return false;

		this.reserves.set(pubkey, balance);
		this.updateTracker.add(pubkey);

		// Wait for both vaults to have at least one update in this cycle
		if (this.updateTracker.size < 2) return false;

		this.state!.baseReserve = this.reserves.get(this.state!.baseVault) ?? 0n;
		this.state!.quoteReserve = this.reserves.get(this.state!.quoteVault) ?? 0n;
		this.state!.price = this.calcPrice();
		if (this.feeTiers.length > 0) {
			this.state!.feeBps = selectFeeTier(this.feeTiers, this.state!.quoteReserve);
		}
		log.info(`[pumpswap] price=${formatPrice(this.state!.price, this.state!.baseSymbol, this.state!.quoteSymbol)}`);

		this.updateTracker.clear();
		return true;
	}

	private applyFeeConfigUpdate(data: Buffer): boolean {
		const now = Date.now();
		if (now - this.lastFeeConfigUpdate < FEE_CONFIG_UPDATE_INTERVAL_MS) return false;

		const tiers = decodePumpFeeConfig(data);
		if (tiers.length === 0) return false;

		this.feeTiers = tiers;
		this.lastFeeConfigUpdate = now;
		if (this.state) {
			this.state.feeBps = selectFeeTier(tiers, this.state.quoteReserve);
			log.info(`[pumpswap] Fee tiers updated (${tiers.length} tiers)`);
		}

		return true;
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
