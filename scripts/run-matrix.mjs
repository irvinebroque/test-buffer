#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const origin = process.argv[2];
if (!origin) {
	console.error("Usage: node scripts/run-matrix.mjs <origin>");
	process.exit(2);
}

const cases = [
	["html-256", "/stream?initial=256&delay=3000"],
	["html-1023", "/stream?initial=1023&delay=3000"],
	["html-1024", "/stream?initial=1024&delay=3000"],
	["html-2048", "/stream?initial=2048&delay=3000"],
	["html-4096", "/stream?initial=4096&delay=3000"],
	["plain-256", "/stream?initial=256&delay=3000&type=plain"],
	["plain-4096", "/stream?initial=4096&delay=3000&type=plain"],
	["plain-4096-low-entropy", "/stream?initial=4096&delay=3000&type=plain&entropy=0"],
	["html-256-no-transform", "/stream?initial=256&delay=3000&no_transform=1"],
];

for (const [name, path] of cases) {
	console.log(`\n===== ${name} =====`);
	const run = spawnSync(process.execPath, ["scripts/probe.mjs", new URL(path, origin).toString(), "gzip"], {
		stdio: "inherit",
	});
	if (run.status !== 0) process.exit(run.status ?? 1);
}
