# Cloudflare compressed HTML streaming reproduction

A small Cloudflare Worker for testing whether compressed responses stream to a
client immediately or are buffered until more response data is available.

The Worker writes an initial chunk, pauses, and then writes a second chunk.
Included Node.js probes record when headers, compressed bytes, and decoded bytes
arrive so behavior can be compared across content types, chunk sizes, cache
directives, and compression algorithms.

## Endpoints

### `GET /`

Returns a browser-friendly streaming demo using the default parameters.

### `GET /stream`

Returns a configurable two-chunk response.

| Query parameter | Default | Description |
| --- | ---: | --- |
| `initial` | `256` | Size of the first chunk in bytes. |
| `total` | `16384` | Total response size in bytes. |
| `delay` | `10000` | Pause between chunks in milliseconds. |
| `type=plain` | unset | Use `text/plain` instead of `text/html`. |
| `entropy=0` | unset | Fill chunks with spaces instead of high-entropy text. |
| `no_transform=1` | unset | Add `no-transform` to `Cache-Control`. |

`initial` must be at least 1 byte, `total` must be larger than `initial`, and
both are limited to 1 MiB. The maximum delay is 15 seconds. Invalid parameters
return a `400` JSON response.

### `GET /email`

Returns a minimal HTML page containing a `mailto:` link.

Any other path returns a short plain-text usage summary.

## Local development

Install dependencies and start Wrangler:

```sh
npm install
npm run dev
```

Then open the demo or request the configurable endpoint:

```sh
open http://localhost:8787/
curl -N "http://localhost:8787/stream?initial=256&total=16384&delay=3000"
```

## Measuring streaming behavior

Run a single timing probe:

```sh
npm run probe -- \
  "https://example.com/stream?initial=256&total=16384&delay=3000" gzip
```

The JSON output includes:

- time to response headers;
- time to the first compressed response bytes;
- time to the first decoded bytes;
- total response time;
- compressed and decoded chunk sizes.

Run the predefined gzip comparison matrix:

```sh
npm run probe:matrix -- https://example.com
```

Sweep several initial chunk sizes and compression algorithms:

```sh
npm run probe:sweep -- https://example.com
npm run probe:sweep -- https://example.com gzip,br,zstd 1500
```

The sweep prints a summary showing whether decoded data arrived before the
configured pause ended. Use a deployed HTTPS origin when testing Cloudflare
edge compression; local Wrangler behavior is not a substitute for that path.

## Tests

```sh
npm test -- --run
```

The test suite runs the Worker in the Cloudflare Workers Vitest pool and checks
response sizes, headers, parameter validation, and the help endpoint.

## Deploy

Review the Worker name, routes, and custom domains in `wrangler.jsonc`, then:

```sh
npm run deploy
```

The checked-in configuration contains project-specific production routes. Do
not deploy it unchanged unless you control those hostnames and intend to update
their routing.

After changing bindings in `wrangler.jsonc`, regenerate Worker types:

```sh
npm run cf-typegen
```

## Project layout

```text
src/index.ts             Worker and streaming response implementation
scripts/probe.mjs        Single-request wire and decode timing probe
scripts/run-matrix.mjs   Sequential comparison matrix
scripts/sweep.mjs        Concurrent size and encoding sweep
test/index.spec.ts       Worker integration tests
wrangler.jsonc           Worker deployment configuration
```

## Notes

- The probe supports `gzip`, `br`, `deflate`, `zstd`, and identity responses.
- The Worker uses deterministic pseudo-random filler only to vary
  compressibility; it is not used for security-sensitive values.
- Probe results are observations of the selected client, route, and deployment
  configuration, not a guarantee about every HTTP client or intermediary.

## Cloudflare documentation

- [Workers](https://developers.cloudflare.com/workers/)
- [Streams API](https://developers.cloudflare.com/workers/runtime-apis/streams/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Content compression](https://developers.cloudflare.com/speed/optimization/content/compression/)
