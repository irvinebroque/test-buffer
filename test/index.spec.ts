import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("compressed HTML streaming reproduction", () => {
	it("documents the reproduction endpoint", async () => {
		const response = await SELF.fetch("https://example.com/help");
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("delay=10000");
	});

	it("streams the requested number of bytes", async () => {
		const response = await SELF.fetch("https://example.com/stream?initial=128&total=2048&delay=0");
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("x-repro-entropy")).toBe("high");
		expect(response.headers.get("x-repro-initial-bytes")).toBe("128");
		expect((await response.arrayBuffer()).byteLength).toBe(2048);
	});

	it("can opt out of transformations", async () => {
		const response = await SELF.fetch("https://example.com/stream?no_transform=1&delay=0");
		expect(response.headers.get("cache-control")).toContain("no-transform");
		await response.arrayBuffer();
	});

	it("rejects invalid parameters", async () => {
		const response = await SELF.fetch("https://example.com/stream?initial=0");
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "initial must be an integer between 1 and 1048576",
		});
	});
});
