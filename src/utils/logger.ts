import chalk from "chalk";

class Logger {
	info(message: string): void {
		console.log(chalk.blue(`[INFO] ${new Date().toISOString()} ${message}`));
	}

	success(message: string): void {
		console.log(chalk.green(`[OK] ${new Date().toISOString()} ${message}`));
	}

	warning(message: string): void {
		console.log(chalk.yellow(`[WARN] ${new Date().toISOString()} ${message}`));
	}

	error(message: string): void {
		console.log(chalk.red(`[ERR] ${new Date().toISOString()} ${message}`));
	}

	time(message: string): void {
		console.log(chalk.gray(`[TIME] ${new Date().toISOString()} ${message}`));
	}

	arb(message: string): void {
		console.log(chalk.magenta(`[ARB] ${new Date().toISOString()} ${message}`));
	}
}

export const log = new Logger();
