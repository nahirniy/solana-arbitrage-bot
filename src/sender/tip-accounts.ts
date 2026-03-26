import { PublicKey } from "@solana/web3.js";
import { RelayName } from "../types";

const TIPS: Record<string, string[]> = {
	[RelayName.HELIUS_JITO]: [
		"4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
		"D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
		"9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
		"5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
		"2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
		"2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
		"wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
		"3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
		"4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
		"4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or"
	],
	[RelayName.BLOCK_RAZOR]: [
		"Gywj98ophM7GmkDdaWs4isqZnDdFCW7B46TXmKfvyqSm",
		"FjmZZrFvhnqqb9ThCuMVnENaM3JGVuGWNyCAxRJcFpg9",
		"6No2i3aawzHsjtThw81iq1EXPJN6rh8eSJCLaYZfKDTG",
		"A9cWowVAiHe9pJfKAj3TJiN9VpbzMUq6E4kEvf5mUT22",
		"68Pwb4jS7eZATjDfhmTXgRJjCiZmw1L7Huy4HNpnxJ3o",
		"4ABhJh5rZPjv63RBJBuyWzBK3g9gWMUQdTZP2kiW31V9",
		"B2M4NG5eyZp5SBQrSdtemzk5TqVuaWGQnowGaCBt8GyM",
		"5jA59cXMKQqZAVdtopv8q3yyw9SYfiE3vUCbt7p8MfVf",
		"5YktoWygr1Bp9wiS1xtMtUki1PeYuuzuCF98tqwYxf61",
		"295Avbam4qGShBYK7E9H5Ldew4B3WyJGmgmXfiWdeeyV",
		"EDi4rSy2LZgKJX74mbLTFk4mxoTgT6F7HxxzG2HBAFyK",
		"BnGKHAC386n4Qmv9xtpBVbRaUTKixjBe3oagkPFKtoy6",
		"Dd7K2Fp7AtoN8xCghKDRmyqr5U169t48Tw5fEd3wT9mq",
		"AP6qExwrbRgBAVaehg4b5xHENX815sMabtBzVB4v8S"
	],
	[RelayName.ASTRALANE]: [
		"astrazznxsGUhWShqgNtAdfrzP2G83DzcWVJDxwV9bF",
		"astra4uejePWneqNaJKuFFA8oonqCE1sqF6b45kDMZm",
		"astra9xWY93QyfG6yM8zwsKsRodscjQ2uU2HKNL5prk",
		"astraRVUuTHjpwEVvNBeQEgwYx9w9CFyfxjYoobCZhL",
		"astraEJ2fEj8Xmy6KLG7B3VfbKfsHXhHrNdCQx7iGJK",
		"astraubkDw81n4LuutzSQ8uzHCv4BhPVhfvTcYv8SKC",
		"astraZW5GLFefxNPAatceHhYjfA1ciq9gvfEg2S47xk",
		"astrawVNP4xDBKT7rAdxrLYiTSTdqtUr63fSMduivXK"
	],
	[RelayName.STELLIUM]: [
		"ste11JV3MLMM7x7EJUM2sXcJC1H7F4jBLnP9a9PG8PH",
		"ste11MWPjXCRfQryCshzi86SGhuXjF4Lv6xMXD2AoSt",
		"ste11p5x8tJ53H1NbNQsRBg1YNRd4GcVpxtDw8PBpmb",
		"ste11p7e2KLYou5bwtt35H7BM6uMdo4pvioGjJXKFcN",
		"ste11TMV68LMi1BguM4RQujtbNCZvf1sjsASpqgAvSX"
	],
	[RelayName.SLOT0]: [
		"Eb2KpSC8uMt9GmzyAEm5Eb1AAAgTjRaXWFjKyFXHZxF3",
		"FCjUJZ1qozm1e8romw216qyfQMaaWKxWsuySnumVCCNe",
		"ENxTEjSQ1YabmUpXAdCgevnHQ9MHdLv8tzFiuiYJqa13",
		"6rYLG55Q9RpsPGvqdPNJs4z5WTxJVatMB8zV3WJhs5EK",
		"Cix2bHfqPcKcM233mzxbLk14kSggUUiz2A87fJtGivXr",
		"6fQaVhYZA4w3MBSXjJ81Vf6W1EDYeUPXpgVQ6UQyU1Av",
		"4HiwLEP2Bzqj3hM2ENxJuzhcPCdsafwiet3oGkMkuQY4",
		"7toBU3inhmrARGngC7z6SjyP85HgGMmCTEwGNRAcYnEK",
		"8mR3wB1nh4D6J9RUCugxUpc6ya8w38LPxZ3ZjcBhgzws",
		"6SiVU5WEwqfFapRuYCndomztEwDjvS5xgtEof3PLEGm9",
		"TpdxgNJBWZRL8UXF5mrEsyWxDWx9HQexA9P1eTWQ42p",
		"D8f3WkQu6dCF33cZxuAsrKHrGsqGP2yvAHf8mX6RXnwf",
		"GQPFicsy3P3NXxB5piJohoxACqTvWE9fKpLgdsMduoHE",
		"Ey2JEr8hDkgN8qKJGrLf2yFjRhW7rab99HVxwi5rcvJE",
		"4iUgjMT8q2hNZnLuhpqZ1QtiV8deFPy2ajvvjEpKKgsS",
		"3Rz8uD83QsU8wKvZbgWAPvCNDU6Fy8TSZTMcPm3RB6zt",
		"6MgjyQU7G988jgL6EGAgfHYoeesCnwYMyPeh1fpJ71FP",
		"AumQWSLrWwDXRq1yDEYPiw8vT5NUBYzrbdWCprJ4ZUa8",
		"ForLDu55GfA2U1aTUaitmjzjs92vvVn1MSqzY3D9HtAK",
		"AsEF2SWSEZ1xpGZ5fdzDKaoka1XEtFSjGo39YUXkpvAh",
		"2WoQNgmc4SEXrR3rKQypmeWmsxGqHHE6rApnVrP6Pt77",
		"12pHu2j2DDShyCVFU7vtSLXga74et9y83VD38mw6XYhB"
	],
	[RelayName.CORVUS_FALCON]: [
		"Fa1con11xLjPddfzRwRUB16sbFZggp2JeJkCeWREyR8X",
		"Fa1con11TM1RuAQzbQzYjTy4Ekfap9Lnc9fnEbQYEd6Q",
		"Fa1con113Bvi76nS5AzUiRDC2fqjfzkNMUNRLgQybMYt",
		"Fa1con1QGHJK232s8yZpzZZwqPexnAKcoyKj626LNsMv",
		"Fa1con1zUzb6qJVFz5tNkPq1Ahm8H1qKW7Q48252QbkQ",
		"Fa1con16d3MSwd3SAiwvr2LwgkpE7ot8zntbpuec8HAx",
		"Fa1con1i7mpa7Qc6epYJ6r4P9AbU77DFFz173r59Df1x",
		"Fa1con18nWn8TdAGL7JX8PertfMUGVSc899NawokJ4Bq",
		"Fa1con1GKusK2EqsfzrDzGPaYZSxQtFGzJiRMMU9Zm2g",
		"Fa1con1RDwVwM9VrJ53CwVefD3VU9c58EMpDawV7fLMi"
	]
};

export function getRandomTipAccount(relay: RelayName): PublicKey {
	const accounts = TIPS[relay];
	if (!accounts || accounts.length === 0) {
		throw new Error(`No tip accounts for relay ${relay}`);
	}
	return new PublicKey(accounts[Math.floor(Math.random() * accounts.length)]);
}
