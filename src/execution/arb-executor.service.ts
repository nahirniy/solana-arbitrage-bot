import { Connection, Keypair, PublicKey, NonceAccount } from "@solana/web3.js";
import type { AddressLookupTableAccount, SimulatedTransactionResponse } from "@solana/web3.js";
import type { ArbOpportunity, ArbRoute, AnyPoolState, WalletAccounts } from "../types";
import { PoolStateService } from "../state";
import { buildExecuteArbAccounts } from "./account-builder";
import { buildArbTransaction } from "./transaction-builder";
import { retry, log, formatError } from "../utils";

export class ArbExecutorService {
	private nonceValue: string;
	private isPending = false;

	constructor(
		private readonly connection: Connection,
		private readonly keypair: Keypair,
		private readonly walletAccounts: WalletAccounts,
		private readonly poolState: PoolStateService,
		private readonly lut: AddressLookupTableAccount,
		private readonly nonceAddress: PublicKey,
		initialNonceValue: string
	) {
		this.nonceValue = initialNonceValue;
	}

	async execute(opportunity: ArbOpportunity): Promise<void> {
		if (this.isPending) return;
		this.isPending = true;

		try {
			const { route } = opportunity;

			const poolStates = new Map<string, AnyPoolState>();
			for (const address of [route.buyPoolAddress, route.sellPoolAddress]) {
				const state = this.poolState.getPoolState(address);
				if (!state) {
					log.error(`[executor] Missing pool state for ${address} — skipping`);
					return;
				}
				poolStates.set(address, state);
			}

			const accounts = buildExecuteArbAccounts(route, poolStates, this.walletAccounts);
			const tx = buildArbTransaction(
				accounts,
				route,
				opportunity.inputAmountLamports,
				this.nonceAddress,
				this.nonceValue,
				this.walletAccounts.wallet,
				this.lut
			);

			tx.sign([this.keypair]);

			const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
			const sig = await this.connection.sendRawTransaction(tx.serialize(), {
				skipPreflight: false,
				maxRetries: 3
			});
			log.success(`[executor] TX sent: ${sig}`);

			await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
			log.success(`[executor] TX confirmed: ${sig}`);
		} catch (err) {
			log.error(`[executor] ${formatError(err)}`);
		} finally {
			await this.refreshNonce();
			this.isPending = false;
		}
	}

	get wallet(): WalletAccounts {
		return this.walletAccounts;
	}

	async simulate(
		route: ArbRoute,
		amountIn: bigint,
		accountAddresses?: string[]
	): Promise<SimulatedTransactionResponse> {
		const poolStates = new Map<string, AnyPoolState>();
		for (const address of [route.buyPoolAddress, route.sellPoolAddress]) {
			const state = this.poolState.getPoolState(address);
			if (!state) throw new Error(`Missing pool state for ${address}`);
			poolStates.set(address, state);
		}

		const accounts = buildExecuteArbAccounts(route, poolStates, this.walletAccounts);
		const tx = buildArbTransaction(
			accounts,
			route,
			amountIn,
			this.nonceAddress,
			this.nonceValue,
			this.walletAccounts.wallet,
			this.lut
		);

		tx.sign([this.keypair]);

		const result = await this.connection.simulateTransaction(tx, {
			sigVerify: false,
			replaceRecentBlockhash: true,
			accounts: accountAddresses
				? { encoding: "base64" as const, addresses: accountAddresses }
				: undefined
		});
		return result.value;
	}

	private async refreshNonce(): Promise<void> {
		try {
			const accountInfo = await retry(() => this.connection.getAccountInfo(this.nonceAddress, "confirmed"));
			if (accountInfo) {
				const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
				this.nonceValue = nonceAccount.nonce;
			}
		} catch (err) {
			log.error(`[executor] Failed to refresh nonce: ${formatError(err)}`);
		}
	}
}
