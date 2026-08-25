#!/usr/bin/env node

import { spawn } from "node:child_process";

const origin = process.argv[2];
const algorithms = (process.argv[3] ?? "gzip,br,zstd").split(",");
const delayMs = Number(process.argv[4] ?? 1500);
const sizes = [128, 256, 512, 1023, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

if (!origin || !Number.isFinite(delayMs)) {
	console.error("Usage: node scripts/sweep.mjs <origin> [gzip,br,zstd] [delay-ms]");
	process.exit(2);
}

function runProbe(algorithm, initial) {
	return new Promise((resolve, reject) => {
		const total = Math.max(131072, initial + 1);
		const url = new URL(`/stream?initial=${initial}&total=${total}&delay=${delayMs}`, origin).toString();
		const child = spawn(process.execPath, ["scripts/probe.mjs", url, algorithm], {
			stdio: ["ignore", "pipe", "inherit"],
		});
		let stdout = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`probe exited ${code}: ${algorithm}, ${initial}`));
				return;
			}
			resolve({ algorithm, initial, ...JSON.parse(stdout) });
		});
	});
}

const jobs = algorithms.flatMap((algorithm) => sizes.map((initial) => [algorithm, initial]));
const results = [];
const concurrency = 4;

for (let index = 0; index < jobs.length; index += concurrency) {
	const batch = jobs.slice(index, index + concurrency);
	results.push(...(await Promise.all(batch.map(([algorithm, initial]) => runProbe(algorithm, initial)))));
}

const summary = results.map((result) => ({
	algorithm: result.algorithm,
	initial: result.initial,
	encoding: result.contentEncoding,
	headersMs: Math.round(result.headersMs),
	firstDecodedBodyMs: Math.round(result.firstDecodedBodyMs),
	endMs: Math.round(result.endMs),
	streamedBeforePauseEnded: result.firstDecodedBodyMs < delayMs,
}));

console.table(summary);
console.log(JSON.stringify({ origin, delayMs, results: summary }, null, 2));
