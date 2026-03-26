import type { TelegramConfig } from "../config/env";
import type { ArbOpportunity, RelayResult } from "../types";
import { retry } from "./helpers";

const TELEGRAM_API_URL = "https://api.telegram.org/bot";

let config: TelegramConfig | null = null;

export function initTelegram(telegramConfig: TelegramConfig | null): void {
	config = telegramConfig;
}

export async function notifyArbExecuted(
	opportunity: ArbOpportunity,
	confirmed: RelayResult,
	tipLamports: number
): Promise<void> {
	if (!config) return;

	const profitSol = (Number(opportunity.profitLamports) / 1e9).toFixed(6);
	const inputSol = (Number(opportunity.inputAmountLamports) / 1e9).toFixed(6);
	const tipSol = (tipLamports / 1e9).toFixed(6);

	const message =
		`✅ <b>ARB EXECUTED</b>\n\n` +
		`<b>Route:</b> ${opportunity.route.buyDex} → ${opportunity.route.sellDex}\n` +
		`<b>Input:</b> ${inputSol} SOL\n` +
		`<b>Profit:</b> ${profitSol} SOL\n` +
		`<b>Tip:</b> ${tipSol} SOL\n` +
		`<b>Relay:</b> ${confirmed.relay}\n` +
		`<b>Slot:</b> ${opportunity.slot}\n\n` +
		`<a href="https://solscan.io/tx/${confirmed.hash}">View on Solscan</a>`;

	await retry(() => sendMessage(message));
}

export async function notifyArbFailed(opportunity: ArbOpportunity, error: string): Promise<void> {
	if (!config) return;

	const profitSol = (Number(opportunity.profitLamports) / 1e9).toFixed(6);

	const message =
		`❌ <b>ARB FAILED</b>\n\n` +
		`<b>Route:</b> ${opportunity.route.buyDex} → ${opportunity.route.sellDex}\n` +
		`<b>Expected profit:</b> ${profitSol} SOL\n` +
		`<b>Error:</b> ${error}`;

	await retry(() => sendMessage(message));
}

async function sendMessage(text: string): Promise<void> {
	if (!config) return;

	const { botToken, chatId } = config;

	const response = await fetch(`${TELEGRAM_API_URL}${botToken}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: "HTML",
			disable_web_page_preview: true
		})
	});

	if (!response.ok) throw new Error(`Telegram API ${response.status}`);
}
