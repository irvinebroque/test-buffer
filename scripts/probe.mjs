#!/usr/bin/env node

import http from "node:http";
import https from "node:https";
import { createBrotliDecompress, createGunzip, createInflate, createZstdDecompress } from "node:zlib";

const target = process.argv[2];
if (!target) {
	console.error("Usage: node scripts/probe.mjs <url> [accept-encoding]");
	process.exit(2);
}

const acceptEncoding = process.argv[3] ?? "gzip";
const url = new URL(target);
const transport = url.protocol === "http:" ? http : https;
const started = process.hrtime.bigint();
const elapsedMs = () => Number(process.hrtime.bigint() - started) / 1e6;

function decoderFor(contentEncoding) {
	switch (contentEncoding) {
		case "gzip":
			return createGunzip();
		case "br":
			return createBrotliDecompress();
		case "deflate":
			return createInflate();
		case "zstd":
			return createZstdDecompress();
		case null:
		case "identity":
			return null;
		default:
			throw new Error(`Unsupported content-encoding for timing probe: ${contentEncoding}`);
	}
}

const result = {
	url: url.toString(),
	acceptEncoding,
	headersMs: null,
	firstWireBodyMs: null,
	firstDecodedBodyMs: null,
	endMs: null,
	status: null,
	httpVersion: null,
	contentEncoding: null,
	wireBytes: 0,
	decodedBytes: 0,
	wireChunks: [],
	decodedChunks: [],
	headers: {},
};

const request = transport.request(
	url,
	{
		headers: {
			"accept-encoding": acceptEncoding,
			"user-agent": "cf-compressed-html-streaming-repro/1.0",
		},
	},
	(response) => {
		result.headersMs = elapsedMs();
		result.status = response.statusCode;
		result.httpVersion = response.httpVersion;
		result.contentEncoding = response.headers["content-encoding"] ?? null;
		result.headers = response.headers;

		let decoded = response;
		const decoder = decoderFor(result.contentEncoding);
		if (decoder) {
			response.pipe(decoder);
			decoded = decoder;
		}

		response.on("data", (chunk) => {
			const atMs = elapsedMs();
			result.firstWireBodyMs ??= atMs;
			result.wireBytes += chunk.length;
			result.wireChunks.push({ atMs, bytes: chunk.length });
		});

		decoded.on("data", (chunk) => {
			const atMs = elapsedMs();
			result.firstDecodedBodyMs ??= atMs;
			result.decodedBytes += chunk.length;
			result.decodedChunks.push({ atMs, bytes: chunk.length });
		});

		decoded.on("end", () => {
			result.endMs = elapsedMs();
			console.log(JSON.stringify(result, null, 2));
		});

		decoded.on("error", fail);
		response.on("error", fail);
	},
);

request.on("error", fail);
request.end();

function fail(error) {
	console.error(error);
	process.exitCode = 1;
}
