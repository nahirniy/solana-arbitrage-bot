import {
	Connection,
	Keypair,
	PublicKey,
	NonceAccount,
	TransactionMessage,
	VersionedTransaction
} from "@solana/web3.js";
import type { AddressLookupTableAccount, SimulatedTransactionResponse } from "@solana/web3.js";
import type { ArbOpportunity, ArbRoute, AnyPoolState, WalletAccounts } from "../types";
import { PoolStateService } from "../state";
import { SenderService } from "../sender";
import { buildExecuteArbAccounts } from "./account-builder";
import { buildArbInstructions } from "./transaction-builder";
import { retry, log, formatError, notifyArbExecuted, notifyArbFailed } from "../utils";

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
		initialNonceValue: string,
		private readonly sender: SenderService
	) {
		this.nonceValue = initialNonceValue;
	}

	async execute(opportunity: ArbOpportunity, tipLamports = 0): Promise<void> {
		if (this.isPending) return;
		this.isPending = true;

		try {
			const { route } = opportunity;
			const profitSol = (Number(opportunity.profitLamports) / 1e9).toFixed(6);
			const tipSol = (tipLamports / 1e9).toFixed(6);

			const poolStates = this.collectPoolStates(route);
			if (!poolStates) return;

			const accounts = buildExecuteArbAccounts(route, poolStates, this.walletAccounts);
			const instructions = buildArbInstructions(
				accounts,
				route,
				opportunity.inputAmountLamports,
				this.nonceAddress,
				this.walletAccounts.wallet
			);

			const candidates = await this.sender.send({
				instructions,
				wallet: this.keypair,
				nonce: this.nonceValue,
				tipLamports,
				luts: [this.lut]
			});

			log.success(`[executor] TX sent via ${candidates.length} relays | profit=${profitSol} tip=${tipSol} SOL`);

			const confirmed = await this.sender.awaitConfirmation(candidates);
			if (confirmed) {
				log.success(`[executor] TX confirmed via ${confirmed.relay}: ${confirmed.hash}`);
				log.info(`[executor] https://solscan.io/tx/${confirmed.hash}`);
				await notifyArbExecuted(opportunity, confirmed, tipLamports);
			} else {
				log.error(`[executor] TX failed to confirm`);
				await notifyArbFailed(opportunity, "Confirmation timeout");
			}
		} catch (err) {
			log.error(`[executor] ${formatError(err)}`);
			notifyArbFailed(opportunity, formatError(err)).catch((e) => log.error(`[telegram] ${formatError(e)}`));
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
		const instructions = buildArbInstructions(accounts, route, amountIn, this.nonceAddress, this.walletAccounts.wallet);

		const message = new TransactionMessage({
			payerKey: this.walletAccounts.wallet,
			recentBlockhash: this.nonceValue,
			instructions
		}).compileToV0Message([this.lut]);
		const tx = new VersionedTransaction(message);
		tx.sign([this.keypair]);

		const result = await this.connection.simulateTransaction(tx, {
			sigVerify: false,
			replaceRecentBlockhash: true,
			accounts: accountAddresses ? { encoding: "base64" as const, addresses: accountAddresses } : undefined
		});
		return result.value;
	}

	private collectPoolStates(route: ArbRoute): Map<string, AnyPoolState> | null {
		const states = new Map<string, AnyPoolState>();
		for (const address of [route.buyPoolAddress, route.sellPoolAddress]) {
			const state = this.poolState.getPoolState(address);
			if (!state) {
				log.error(`[executor] Missing pool state for ${address} — skipping`);
				return null;
			}
			states.set(address, state);
		}
		return states;
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
