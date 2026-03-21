import type { AmmPoolState, PoolStateHandler } from "../types";
import { TOKEN_DECIMALS } from "../config";
import { decodeTokenAccountBalance } from "../decoders";
import { ammGetPrice } from "../math";
import { log, formatPrice } from "../utils";

export class AmmStateService implements PoolStateHandler {
	private state: AmmPoolState | null = null;
	private reserves = new Map<string, bigint>();
	private pendingReserves = new Map<string, bigint>();
	private updateTracker = new Set<string>();
	init(state: AmmPoolState): void {
		this.state = state;
		this.state.price = this.calcPrice();
		this.reserves.set(state.baseVault, state.baseReserve);
		this.reserves.set(state.quoteVault, state.quoteReserve);
	}

	isSubscribed(pubkey: string): boolean {
		if (!this.state) return false;
		return pubkey === this.state.baseVault || pubkey === this.state.quoteVault;
	}

	// Geyser sends vault token account updates separately.
	// We buffer until both vaults are fresh before committing — avoids arb checks on stale half-state.
	handleUpdate(pubkey: string, data: Buffer): boolean {
		if (!this.state) return false;

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

		this.state.baseReserve = this.reserves.get(this.state.baseVault) ?? 0n;
		this.state.quoteReserve = this.reserves.get(this.state.quoteVault) ?? 0n;
		this.state.price = this.calcPrice();
		log.info(`[amm] price=${formatPrice(this.state.price, this.state.baseSymbol, this.state.quoteSymbol)}`);

		this.pendingReserves.clear();
		this.updateTracker.clear();
		return true;
	}

	getState(): AmmPoolState | null {
		return this.state;
	}

	getSubscriptionAddresses(): string[] {
		if (!this.state) return [];
		return [this.state.baseVault, this.state.quoteVault];
	}

	private calcPrice(): bigint {
		if (!this.state) return 0n;
		return ammGetPrice(
			this.state.baseReserve,
			this.state.quoteReserve,
			TOKEN_DECIMALS[this.state.baseSymbol],
			TOKEN_DECIMALS[this.state.quoteSymbol]
		);
	}
}
