import type { AnyPoolState, PoolStateHandler } from "../types";

export class PoolStateService {
	private readonly poolsByAddress = new Map<string, PoolStateHandler>();
	private readonly handlersByPubkey = new Map<string, PoolStateHandler>(); // every subscribed pubkey -> him handler

	register(poolAddress: string, handler: PoolStateHandler): void {
		this.poolsByAddress.set(poolAddress, handler);

		for (const subscribedPubkey of handler.getSubscriptionAddresses()) {
			this.handlersByPubkey.set(subscribedPubkey, handler);
		}
	}

	getPoolState(poolAddress: string): AnyPoolState | null {
		const handler = this.poolsByAddress.get(poolAddress);
		if (!handler) return null;
		return handler.getState();
	}

	handleUpdate(pubkey: string, data: Buffer): boolean {
		const handler = this.handlersByPubkey.get(pubkey);
		if (!handler) return false;
		return handler.handleUpdate(pubkey, data);
	}

	// Called after DLMM resubscription to update pubkey -> handler mapping
	refreshSubscriptions(handler: PoolStateHandler): void {
		// remove old pubkeys for this handler
		for (const [pubkey, h] of this.handlersByPubkey) {
			if (h === handler) this.handlersByPubkey.delete(pubkey);
		}

		for (const addr of handler.getSubscriptionAddresses()) {
			this.handlersByPubkey.set(addr, handler);
		}
	}

	getAllSubscriptionAddresses(): string[] {
		return Array.from(this.handlersByPubkey.keys());
	}
}
