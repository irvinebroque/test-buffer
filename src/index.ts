const encoder = new TextEncoder();

const DEFAULT_INITIAL_BYTES = 256;
const DEFAULT_TOTAL_BYTES = 16 * 1024;
const DEFAULT_DELAY_MS = 10_000;
const MAX_DELAY_MS = 15_000;
const MAX_TOTAL_BYTES = 1024 * 1024;

function integerParam(url: URL, name: string, fallback: number, min: number, max: number): number {
	const raw = url.searchParams.get(name);
	if (raw === null) return fallback;

	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < min || value > max) {
		throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
	}

	return value;
}

function sizedChunk(prefix: string, byteLength: number, entropy: boolean, suffix = ""): Uint8Array {
	const prefixBytes = encoder.encode(prefix);
	const suffixBytes = encoder.encode(suffix);
	if (prefixBytes.byteLength + suffixBytes.byteLength > byteLength) {
		return encoder.encode(prefix + suffix).slice(0, byteLength);
	}

	const result = new Uint8Array(byteLength);
	result.set(prefixBytes);
	const fillEnd = byteLength - suffixBytes.byteLength;
	if (!entropy) {
		result.fill(" ".charCodeAt(0), prefixBytes.byteLength, fillEnd);
		result.set(suffixBytes, fillEnd);
		return result;
	}

	let state = 0x12345678;
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	for (let index = prefixBytes.byteLength; index < fillEnd; index++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		result[index] = alphabet.charCodeAt(state % alphabet.length);
	}
	result.set(suffixBytes, fillEnd);
	return result;
}

function streamResponse(request: Request, ctx: ExecutionContext): Response {
	const url = new URL(request.url);
	const initialBytes = integerParam(url, "initial", DEFAULT_INITIAL_BYTES, 1, MAX_TOTAL_BYTES);
	const totalBytes = integerParam(url, "total", DEFAULT_TOTAL_BYTES, initialBytes + 1, MAX_TOTAL_BYTES);
	const delayMs = integerParam(url, "delay", DEFAULT_DELAY_MS, 0, MAX_DELAY_MS);
	const type = url.searchParams.get("type") === "plain" ? "text/plain; charset=utf-8" : "text/html; charset=utf-8";
	const noTransform = url.searchParams.get("no_transform") === "1";
	const entropy = url.searchParams.get("entropy") !== "0";
	const demo = url.searchParams.get("demo") === "1";

	const first = demo
		? sizedChunk(
				"<!doctype html><meta charset=\"utf-8\"><title>Streaming repro</title><main><h1>Initial HTML shell</h1><p>This should appear immediately if streaming works.</p><span style=\"display:none\">",
				initialBytes,
				entropy,
				"</span></main>",
			)
		: sizedChunk("<!doctype html><html><head><title>streaming repro</title></head><body><main>", initialBytes, entropy);
	const last = demo
		? sizedChunk(
				`<main><h2>Second chunk arrived after ${delayMs / 1000} seconds</h2><p>If both messages appeared together, the response was buffered.</p><span style="display:none">`,
				totalBytes - initialBytes,
				entropy,
				"</span></main>",
			)
		: sizedChunk(
				"</main><div id=\"complete\">complete after pause; contact <a href=\"mailto:repro@example.com\">repro@example.com</a></div></body></html>",
				totalBytes - initialBytes,
				entropy,
			);

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const pump = (async () => {
		const writer = writable.getWriter();
		try {
			await writer.write(first);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			await writer.write(last);
			await writer.close();
		} catch (error) {
			await writer.abort(error).catch(() => undefined);
		}
	});
	ctx.waitUntil(pump());

	const headers = new Headers({
		"cache-control": noTransform ? "no-store, no-transform" : "no-store",
		"content-type": type,
		"x-repro-delay-ms": String(delayMs),
		"x-repro-entropy": entropy ? "high" : "low",
		"x-repro-initial-bytes": String(initialBytes),
		"x-repro-total-bytes": String(totalBytes),
	});

	return new Response(readable, { headers });
}

export default {
	fetch(request, _env, ctx): Response {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			url.searchParams.set("demo", "1");
			try {
				return streamResponse(new Request(url, request), ctx);
			} catch (error) {
				return Response.json(
					{ error: error instanceof Error ? error.message : String(error) },
					{ status: 400 },
				);
			}
		}

		if (url.pathname === "/stream") {
			try {
				return streamResponse(request, ctx);
			} catch (error) {
				return Response.json(
					{ error: error instanceof Error ? error.message : String(error) },
					{ status: 400 },
				);
			}
		}

		if (url.pathname === "/email") {
			return new Response(
				"<!doctype html><html><body><a href=\"mailto:repro@example.com\">repro@example.com</a></body></html>",
				{
				headers: { "content-type": "text/html; charset=utf-8" },
				},
			);
		}

		return new Response(
			[
				"Cloudflare compressed HTML streaming reproduction",
				"",
				"GET / or /stream?initial=256&total=16384&delay=10000",
				"Optional: type=plain, no_transform=1",
			].join("\n"),
			{ headers: { "content-type": "text/plain; charset=utf-8" } },
		);
	},
} satisfies ExportedHandler<Env>;
