import {
	Connection,
	Keypair,
	PublicKey,
	NonceAccount,
	SystemProgram,
	Transaction,
	AddressLookupTableProgram,
	sendAndConfirmTransaction,
	NONCE_ACCOUNT_LENGTH
} from "@solana/web3.js";
import {
	getAssociatedTokenAddressSync,
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID,
	TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import bs58 from "bs58";
import type { AddressLookupTableAccount } from "@solana/web3.js";
import type { EnvConfig } from "../config";
import type { ArbPoolsConfig, WalletAccounts } from "../types";
import {
	ARB_PROGRAM,
	PUMP_PROGRAM,
	LIA_MINT,
	WSOL_MINT,
	PUMP_GLOBAL_CONFIG,
	PUMP_EVENT_AUTHORITY,
	PUMP_FEE_PROGRAM,
	PUMP_COIN_CREATOR_VAULT_ATA,
	PUMP_COIN_CREATOR_VAULT_AUTHORITY,
	PUMP_FEE_CONFIG,
	PUMP_STATIC_ACCOUNT,
	PUMP_GLOBAL_VOLUME_ACCUMULATOR,
	PUMP_BUY_FEE_RECIPIENT,
	PUMP_BUY_FEE_RECIPIENT_ATA,
	PUMP_SELL_FEE_RECIPIENT,
	PUMP_SELL_FEE_RECIPIENT_ATA,
	METEORA_PROGRAM,
	MEMO_PROGRAM
} from "../config/program.config";
import { PoolStateService } from "../state";
import { ArbExecutorService } from "./arb-executor.service";
import { retry, log, sleep } from "../utils";

export async function initializeExecution(
	env: EnvConfig,
	poolState: PoolStateService,
	arbPoolsConfigs: readonly ArbPoolsConfig[]
): Promise<ArbExecutorService> {
	const keypair = Keypair.fromSecretKey(bs58.decode(env.privateKey));
	log.info(`[startup] Wallet: ${keypair.publicKey.toBase58()}`);

	const walletAccounts = deriveWalletAccounts(keypair.publicKey);
	await createMissingAtas(env.connection, keypair, walletAccounts);

	const lut = await loadOrCreateLut(env.connection, keypair, walletAccounts, arbPoolsConfigs, env.lutAddress);
	const nonce = await loadOrCreateNonce(env.connection, keypair, env.nonceAddress);

	log.success("[startup] Execution initialized");

	return new ArbExecutorService(env.connection, keypair, walletAccounts, poolState, lut, nonce.address, nonce.value);
}

// ── Wallet account derivation ───────────────────────────────────────

function deriveWalletAccounts(wallet: PublicKey): WalletAccounts {
	const userBaseAta = getAssociatedTokenAddressSync(LIA_MINT, wallet, false, TOKEN_2022_PROGRAM_ID);
	const userQuoteAta = getAssociatedTokenAddressSync(WSOL_MINT, wallet, false, TOKEN_PROGRAM_ID);

	const [userVolumeAcc] = PublicKey.findProgramAddressSync(
		[Buffer.from("user_volume_accumulator"), wallet.toBuffer()],
		PUMP_PROGRAM
	);
	const userVolumeAccWsol = getAssociatedTokenAddressSync(WSOL_MINT, userVolumeAcc, true, TOKEN_PROGRAM_ID);

	const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], ARB_PROGRAM);
	const [operatorPda] = PublicKey.findProgramAddressSync([Buffer.from("operator"), wallet.toBuffer()], ARB_PROGRAM);

	return { wallet, userBaseAta, userQuoteAta, userVolumeAcc, userVolumeAccWsol, configPda, operatorPda };
}

// ── ATA setup ───────────────────────────────────────────────────────

async function createMissingAtas(connection: Connection, keypair: Keypair, accounts: WalletAccounts): Promise<void> {
	const atas = [accounts.userBaseAta, accounts.userQuoteAta, accounts.userVolumeAccWsol];
	const infos = await retry(() => connection.getMultipleAccountsInfo(atas));

	const ixs = [];

	if (!infos[0]) {
		ixs.push(
			createAssociatedTokenAccountIdempotentInstruction(
				keypair.publicKey,
				accounts.userBaseAta,
				keypair.publicKey,
				LIA_MINT,
				TOKEN_2022_PROGRAM_ID
			)
		);
	}
	if (!infos[1]) {
		ixs.push(
			createAssociatedTokenAccountIdempotentInstruction(
				keypair.publicKey,
				accounts.userQuoteAta,
				keypair.publicKey,
				WSOL_MINT,
				TOKEN_PROGRAM_ID
			)
		);
	}
	if (!infos[2]) {
		ixs.push(
			createAssociatedTokenAccountIdempotentInstruction(
				keypair.publicKey,
				accounts.userVolumeAccWsol,
				accounts.userVolumeAcc,
				WSOL_MINT,
				TOKEN_PROGRAM_ID
			)
		);
	}

	if (ixs.length === 0) {
		log.info("[startup] All ATAs exist");
		return;
	}

	const tx = new Transaction().add(...ixs);
	await retry(() => sendAndConfirmTransaction(connection, tx, [keypair]));
	log.success(`[startup] Created ${ixs.length} ATA(s)`);
}

// ── LUT setup ───────────────────────────────────────────────────────

async function loadOrCreateLut(
	connection: Connection,
	keypair: Keypair,
	walletAccounts: WalletAccounts,
	arbPoolsConfigs: readonly ArbPoolsConfig[],
	existingAddress: string | null
): Promise<AddressLookupTableAccount> {
	if (existingAddress) {
		const result = await retry(() => connection.getAddressLookupTable(new PublicKey(existingAddress)));
		if (!result.value) throw new Error(`LUT account not found: ${existingAddress}`);

		log.info(`[startup] LUT loaded: ${existingAddress} (${result.value.state.addresses.length} addresses)`);
		return result.value;
	}

	log.info("[startup] Creating LUT...");

	const slot = await connection.getSlot("confirmed");
	const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
		authority: keypair.publicKey,
		payer: keypair.publicKey,
		recentSlot: slot
	});

	const addresses = collectLutAddresses(walletAccounts, arbPoolsConfigs);

	const extendIx = AddressLookupTableProgram.extendLookupTable({
		payer: keypair.publicKey,
		authority: keypair.publicKey,
		lookupTable: lutAddress,
		addresses
	});

	const tx = new Transaction().add(createIx, extendIx);
	await retry(() => sendAndConfirmTransaction(connection, tx, [keypair]));

	// LUT needs one slot to activate
	await sleep(1000);

	const result = await retry(() => connection.getAddressLookupTable(lutAddress));
	if (!result.value) throw new Error("LUT created but not readable — try again");

	log.success(`[startup] LUT created: ${lutAddress.toBase58()} — save as LUT_ADDRESS in .env`);
	return result.value;
}

function collectLutAddresses(w: WalletAccounts, configs: readonly ArbPoolsConfig[]): PublicKey[] {
	const addresses = [
		w.wallet,
		w.operatorPda,
		w.configPda,
		w.userBaseAta,
		w.userQuoteAta,
		w.userVolumeAcc,
		w.userVolumeAccWsol,
		LIA_MINT,
		WSOL_MINT,
		TOKEN_PROGRAM_ID,
		TOKEN_2022_PROGRAM_ID,
		SystemProgram.programId,
		ARB_PROGRAM,
		PUMP_PROGRAM,
		PUMP_FEE_PROGRAM,
		PUMP_GLOBAL_CONFIG,
		PUMP_EVENT_AUTHORITY,
		PUMP_COIN_CREATOR_VAULT_ATA,
		PUMP_COIN_CREATOR_VAULT_AUTHORITY,
		PUMP_FEE_CONFIG,
		PUMP_STATIC_ACCOUNT,
		PUMP_GLOBAL_VOLUME_ACCUMULATOR,
		PUMP_BUY_FEE_RECIPIENT,
		PUMP_BUY_FEE_RECIPIENT_ATA,
		PUMP_SELL_FEE_RECIPIENT,
		PUMP_SELL_FEE_RECIPIENT_ATA,
		METEORA_PROGRAM,
		MEMO_PROGRAM
	];

	for (const config of configs) {
		for (const pool of config.pools) {
			addresses.push(new PublicKey(pool.poolAddress));
		}
	}

	return addresses;
}

// ── Nonce setup ─────────────────────────────────────────────────────

async function loadOrCreateNonce(
	connection: Connection,
	keypair: Keypair,
	existingAddress: string | null
): Promise<{ address: PublicKey; value: string }> {
	if (existingAddress) {
		const pubkey = new PublicKey(existingAddress);
		const accountInfo = await retry(() => connection.getAccountInfo(pubkey));
		if (!accountInfo) throw new Error(`Nonce account not found: ${existingAddress}`);

		const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
		log.info(`[startup] Nonce loaded: ${existingAddress}`);
		return { address: pubkey, value: nonceAccount.nonce };
	}

	log.info("[startup] Creating nonce account...");

	const nonceKeypair = Keypair.generate();
	const rentExempt = await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);

	const tx = new Transaction().add(
		SystemProgram.createAccount({
			fromPubkey: keypair.publicKey,
			newAccountPubkey: nonceKeypair.publicKey,
			lamports: rentExempt,
			space: NONCE_ACCOUNT_LENGTH,
			programId: SystemProgram.programId
		}),
		SystemProgram.nonceInitialize({
			noncePubkey: nonceKeypair.publicKey,
			authorizedPubkey: keypair.publicKey
		})
	);

	await retry(() => sendAndConfirmTransaction(connection, tx, [keypair, nonceKeypair]));

	const accountInfo = await retry(() => connection.getAccountInfo(nonceKeypair.publicKey));
	if (!accountInfo) throw new Error("Nonce created but not readable");

	const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
	log.success(`[startup] Nonce created: ${nonceKeypair.publicKey.toBase58()} — save as NONCE_ADDRESS in .env`);
	return { address: nonceKeypair.publicKey, value: nonceAccount.nonce };
}
