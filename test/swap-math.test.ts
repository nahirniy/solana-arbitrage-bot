import "dotenv/config";
import { expect } from "chai";
import { Keypair, Connection } from "@solana/web3.js";
import bs58 from "bs58";
import { loadEnv, buildArbPoolsConfigs } from "../src/config";
import { PoolStateService, initializeState } from "../src/state";
import { pumpSwapGetBuyOutput, pumpSwapGetSellOutput } from "../src/math/pumpswap-math";
import { meteoraGetAmountOut } from "../src/math/meteora-math";
import { DexType } from "../src/types";
import type { PumpSwapPoolState, MeteoraPoolState, WalletAccounts } from "../src/types";
import { buildPumpSwapBuy, buildPumpSwapSell, buildMeteoraSwap, simulateSwapAndGetDelta, getTokenBalance } from "./utils";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { ARB_PROGRAM, PUMP_PROGRAM, LIA_MINT, WSOL_MINT } from "../src/config/program.config";

const BUY_AMOUNTS = [500_000n, 1_000_000n, 5_000_000n]; // 0.0005, 0.001, 0.005 SOL
const SELL_AMOUNTS = [1_000_000_000n, 5_000_000_000n, 10_000_000_000n]; // 1K, 5K, 10K LIA


describe("Swap Math vs On-Chain Estimation", function () {
	this.timeout(60_000);

	let connection: Connection;
	let keypair: Keypair;
	let walletAccounts: WalletAccounts;
	let pumpSwapState: PumpSwapPoolState;
	let meteoraState: MeteoraPoolState;
	let pumpPoolAddress: string;
	let meteoraPoolAddress: string;

	before(async function () {
		const env = loadEnv();
		connection = env.connection;
		keypair = Keypair.fromSecretKey(bs58.decode(env.privateKey));

		const wallet = keypair.publicKey;
		const userBaseAta = getAssociatedTokenAddressSync(LIA_MINT, wallet, false, TOKEN_2022_PROGRAM_ID);
		const userQuoteAta = getAssociatedTokenAddressSync(WSOL_MINT, wallet, false, TOKEN_PROGRAM_ID);
		const [userVolumeAcc] = PublicKey.findProgramAddressSync(
			[Buffer.from("user_volume_accumulator"), wallet.toBuffer()],
			PUMP_PROGRAM
		);
		const userVolumeAccWsol = getAssociatedTokenAddressSync(WSOL_MINT, userVolumeAcc, true, TOKEN_PROGRAM_ID);
		const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], ARB_PROGRAM);
		const [operatorPda] = PublicKey.findProgramAddressSync([Buffer.from("operator"), wallet.toBuffer()], ARB_PROGRAM);
		walletAccounts = { wallet, userBaseAta, userQuoteAta, userVolumeAcc, userVolumeAccWsol, configPda, operatorPda };

		const arbPoolsConfigs = buildArbPoolsConfigs();
		const poolState = new PoolStateService();
		await initializeState(connection, arbPoolsConfigs, poolState);

		const config = arbPoolsConfigs[0];
		const pumpPool = config.pools.find((p) => p.dexType === DexType.PUMPSWAP)!;
		const meteoraPool = config.pools.find((p) => p.dexType === DexType.METEORA)!;

		pumpPoolAddress = pumpPool.poolAddress;
		pumpSwapState = poolState.getPoolState(pumpPoolAddress) as PumpSwapPoolState;
		meteoraPoolAddress = meteoraPool.poolAddress;
		meteoraState = poolState.getPoolState(meteoraPoolAddress) as MeteoraPoolState;
	});

	describe("PumpSwap AMM", function () {
		beforeEach(async function () {
			const freshConfigs = buildArbPoolsConfigs();
			const freshState = new PoolStateService();
			await initializeState(connection, freshConfigs, freshState);
			pumpSwapState = freshState.getPoolState(pumpPoolAddress) as PumpSwapPoolState;
		});

		for (const buyAmount of BUY_AMOUNTS) {
			it(`buy ${Number(buyAmount) / 1e9} SOL → LIA matches on-chain`, async function () {
				const expected = pumpSwapGetBuyOutput(buyAmount, pumpSwapState.quoteReserve, pumpSwapState.baseReserve, pumpSwapState.feeBps);
				const ix = buildPumpSwapBuy(buyAmount, walletAccounts, pumpSwapState);
				const actual = await simulateSwapAndGetDelta(connection, keypair, ix, walletAccounts.userBaseAta);

				console.log(`    Math:    ${expected} LIA raw`);
				console.log(`    OnChain: ${actual} LIA raw`);

				expect(actual).to.equal(expected);
			});
		}

		for (const sellAmount of SELL_AMOUNTS) {
			it(`sell ${Number(sellAmount) / 1e6} LIA → SOL matches on-chain`, async function () {
				const liaBalance = await getTokenBalance(connection, walletAccounts.userBaseAta);
				if (liaBalance === 0n) return this.skip();

				const amount = liaBalance < sellAmount ? liaBalance : sellAmount;
				const expected = pumpSwapGetSellOutput(amount, pumpSwapState.baseReserve, pumpSwapState.quoteReserve, pumpSwapState.feeBps);
				const ix = buildPumpSwapSell(amount, walletAccounts, pumpSwapState);
				const actual = await simulateSwapAndGetDelta(connection, keypair, ix, walletAccounts.userQuoteAta);

				console.log(`    Math:    ${expected} lamports`);
				console.log(`    OnChain: ${actual} lamports`);

				expect(actual).to.equal(expected);
			});
		}
	});

	describe("Meteora Meteora", function () {
		beforeEach(async function () {
			const freshConfigs = buildArbPoolsConfigs();
			const freshState = new PoolStateService();
			await initializeState(connection, freshConfigs, freshState);
			meteoraState = freshState.getPoolState(meteoraPoolAddress) as MeteoraPoolState;
		});

		for (const buyAmount of BUY_AMOUNTS) {
			it(`buy ${Number(buyAmount) / 1e9} SOL → LIA matches on-chain`, async function () {
				const bins = getOrderedBins(meteoraState, false);
				const expected = meteoraGetAmountOut(buyAmount, bins, meteoraState.binStep, meteoraState.feeParams, false);

				const ix = buildMeteoraSwap(buyAmount, false, walletAccounts, meteoraState);
				const actual = await simulateSwapAndGetDelta(connection, keypair, ix, walletAccounts.userBaseAta);

				console.log(`    Math:    ${expected} LIA raw`);
				console.log(`    OnChain: ${actual} LIA raw`);

				expect(actual).to.equal(expected);
			});
		}

		for (const sellAmount of SELL_AMOUNTS) {
			it(`sell ${Number(sellAmount) / 1e6} LIA → SOL matches on-chain`, async function () {
				const liaBalance = await getTokenBalance(connection, walletAccounts.userBaseAta);
				if (liaBalance === 0n) return this.skip();

				const amount = liaBalance < sellAmount ? liaBalance : sellAmount;
				const bins = getOrderedBins(meteoraState, true);
				const expected = meteoraGetAmountOut(amount, bins, meteoraState.binStep, meteoraState.feeParams, true);

				const ix = buildMeteoraSwap(amount, true, walletAccounts, meteoraState);
				const actual = await simulateSwapAndGetDelta(connection, keypair, ix, walletAccounts.userQuoteAta);

				console.log(`    Math:    ${expected} lamports`);
				console.log(`    OnChain: ${actual} lamports`);

				expect(actual).to.equal(expected);
			});
		}
	});
});

function getOrderedBins(state: MeteoraPoolState, swapXtoY: boolean) {
	const allBins = Array.from(state.binArrays.values()).flatMap((arr) => arr.bins);

	if (swapXtoY) {
		return allBins.filter((b) => b.id <= state.activeId).sort((a, b) => b.id - a.id);
	}
	return allBins.filter((b) => b.id >= state.activeId).sort((a, b) => a.id - b.id);
}
