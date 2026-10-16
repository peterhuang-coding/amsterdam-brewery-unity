"use strict";

// D26 PACK01 loader regression tests (node:test, Node 22 native APIs).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const loader = require("./geo-loader.js");

const ROOT = __dirname;
const GZIP_BYTES = fs.readFileSync(
  path.join(ROOT, "sample-runtime.json.gz")
);
const JSON_BYTES = fs.readFileSync(
  path.join(ROOT, "sample-runtime.json")
);
const EXPECTED_FEATURES = 53;

function byteStream(bytes, chunkSize) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new ReadableStream({
    start(controller) {
      if (!chunkSize || chunkSize >= data.byteLength) {
        controller.enqueue(data);
      } else {
        for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
          controller.enqueue(data.subarray(offset, offset + chunkSize));
        }
      }
      controller.close();
    },
  });
}

function fakeResponse({
  ok = true,
  status = 200,
  body,
  headers = {},
  chunkSize,
}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return Object.prototype.hasOwnProperty.call(
          headers,
          String(name).toLowerCase()
        )
          ? headers[String(name).toLowerCase()]
          : null;
      },
    },
    body: body !== undefined ? body : byteStream(GZIP_BYTES, chunkSize),
  };
}

function fakeFetch(response, calls) {
  return async function fetchImpl(url) {
    if (calls) {
      calls.push(url);
    }
    return response instanceof Function ? response(url) : response;
  };
}

function assertRealData(data) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.projection.units, "metres");
  assert.equal(data.projection.type, "local-equirectangular");
  assert.ok(Array.isArray(data.bbox) && data.bbox.length === 4);
  const total = loader.LAYER_NAMES.reduce(
    (sum, name) => sum + data.layers[name].length,
    0
  );
  assert.equal(total, EXPECTED_FEATURES);
}

// -------------------------------------------------------------------------- //
test("real generated gzip loads through fake fetch (.gz url, one chunk)", async () => {
  const data = await loader.load(
    "https://example.test/assets/sample-runtime.json.gz",
    { fetchImpl: fakeFetch(fakeResponse({})) }
  );
  assertRealData(data);
});

test("real generated gzip loads when split into tiny chunks", async () => {
  const calls = [];
  const data = await loader.load("https://example.test/a/runtime.gz", {
    fetchImpl: fakeFetch(fakeResponse({ chunkSize: 37 }), calls),
  });
  assert.deepEqual(calls, ["https://example.test/a/runtime.gz"]);
  assertRealData(data);
});

test("content-encoding: gzip header triggers decompression for plain url", async () => {
  const data = await loader.load("https://example.test/runtime", {
    fetchImpl: fakeFetch(
      fakeResponse({ headers: { "content-encoding": "gzip" } })
    ),
  });
  assertRealData(data);
});

test("plain JSON asset loads when no gzip encoding or suffix", async () => {
  const response = fakeResponse({
    body: byteStream(JSON_BYTES),
    headers: { "content-type": "application/json" },
  });
  const data = await loader.load("https://example.test/sample-runtime.json", {
    fetchImpl: fakeFetch(response),
  });
  assertRealData(data);
});

test("HTTP error status rejects and names the status", async () => {
  const response = fakeResponse({ ok: false, status: 503 });
  await assert.rejects(
    loader.load("https://example.test/missing.gz", {
      fetchImpl: fakeFetch(response),
    }),
    /HTTP error 503/
  );
});

test("HTTP 404 without ok rejects", async () => {
  const response = { ok: false, status: 404, headers: { get: () => null } };
  await assert.rejects(
    loader.load("https://example.test/x.gz", {
      fetchImpl: fakeFetch(response),
    }),
    /404/
  );
});

test("garbage body at .gz url (no gzip magic) rejects as decode failure", async () => {
  // Detection now trusts body bytes, not the URL: this is mislabelled plain
  // text, so it fails explicitly at JSON decode instead of double-gunzip.
  const junk = new TextEncoder().encode("definitely not gzip payload".repeat(8));
  await assert.rejects(
    loader.load("https://example.test/bad.gz", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(junk) })),
    }),
    /decode/i
  );
});

test("real gzip magic followed by corrupt payload rejects gzip decode", async () => {
  const corrupt = new Uint8Array(64);
  corrupt[0] = 0x1f;
  corrupt[1] = 0x8b;
  await assert.rejects(
    loader.load("https://example.test/corrupt.gz", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(corrupt, 3) })),
    }),
    /gzip decode failed/i
  );
});

test("garbage gzip body in tiny chunks still rejects (readers released)", async () => {
  const junk = new TextEncoder().encode("not gzip not gzip not gzip not gzip");
  await assert.rejects(
    loader.load("https://example.test/bad2.gz", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(junk, 5) })),
    }),
    /gzip decode failed|decode/i
  );
});

test("schema-invalid gzip payload rejects gracefully", async () => {
  const payload = zlib.gzipSync(
    Buffer.from(JSON.stringify({ schemaVersion: 1 }), "utf-8")
  );
  await assert.rejects(
    loader.load("https://example.test/short.gz", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(payload) })),
    }),
    /projection|layers|bbox/
  );
});

test("malformed plain data rejects on schema", async () => {
  const body = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
  await assert.rejects(
    loader.load("https://example.test/plain.json", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(body) })),
    }),
    /schemaVersion/
  );
});

test("invalid JSON text rejects cleanly", async () => {
  const body = new TextEncoder().encode("{not valid json");
  await assert.rejects(
    loader.load("https://example.test/broken.json", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(body) })),
    }),
    /not valid JSON/
  );
});

test("feature with non-finite ring rejects schema validation", async () => {
  const good = JSON.parse(JSON_BYTES.toString("utf-8"));
  good.layers.water[0].polygons[0][0][0] = [NaN, 1];
  const body = new TextEncoder().encode(JSON.stringify(good));
  await assert.rejects(
    loader.load("https://example.test/nonfinite.json", {
      fetchImpl: fakeFetch(fakeResponse({ body: byteStream(body) })),
    }),
    /ring|finite/
  );
});

test("maxDecodedBytes bound rejects oversized decoded stream", async () => {
  await assert.rejects(
    loader.load("https://example.test/sample-runtime.json.gz", {
      fetchImpl: fakeFetch(fakeResponse({ chunkSize: 64 })),
      maxDecodedBytes: 4096,
    }),
    /exceeds maxDecodedBytes 4096/
  );
});

test("invalid maxDecodedBytes and url reject without fetching", async () => {
  let called = 0;
  const countingFetch = async () => {
    called += 1;
    return fakeResponse({});
  };
  await assert.rejects(
    loader.load("x.gz", { fetchImpl: countingFetch, maxDecodedBytes: 0 }),
    /maxDecodedBytes/
  );
  await assert.rejects(
    loader.load("x.gz", { fetchImpl: countingFetch, maxDecodedBytes: -1 }),
    /maxDecodedBytes/
  );
  await assert.rejects(
    loader.load("x.gz", { fetchImpl: countingFetch, maxDecodedBytes: "big" }),
    /maxDecodedBytes/
  );
  await assert.rejects(
    loader.load("", { fetchImpl: countingFetch }),
    /url/
  );
  assert.equal(called, 0);
});

test("missing fetch implementation rejects", async () => {
  // VM sandbox without fetch or fetchImpl option.
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "geo-loader.js"), "utf-8"), sandbox);
  await assert.rejects(
    sandbox.AmsterdamGeoLoader.load("https://example.test/a.gz"),
    /fetch implementation/
  );
});

test("UMD browser global identity and no auto-fetch on import", async () => {
  const fetched = [];
  const sandbox = {
    ReadableStream,
    DecompressionStream,
    TextDecoder,
    Uint8Array,
    console,
    fetch(url) {
      fetched.push(url);
      return Promise.resolve(
        fakeResponse({ chunkSize: 128 })
      );
    },
  };
  vm.createContext(sandbox);
  // Importing assigns the global and performs no network.
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "geo-loader.js"), "utf-8"),
    sandbox
  );
  assert.equal(fetched.length, 0, "must not auto-fetch when imported");
  assert.equal(typeof sandbox.AmsterdamGeoLoader, "object");
  assert.equal(typeof sandbox.AmsterdamGeoLoader.load, "function");
  assert.equal(sandbox.AmsterdamGeoLoader.SCHEMA_VERSION, 1);
  assert.equal(
    sandbox.AmsterdamGeoLoader.DEFAULT_MAX_DECODED_BYTES,
    128 * 1024 * 1024
  );

  // The browser-global loader works end to end via injected fetch.
  const data = await sandbox.AmsterdamGeoLoader.load(
    "https://example.test/browser/global.gz"
  );
  assertRealData(data);
  assert.deepEqual(fetched, ["https://example.test/browser/global.gz"]);
});

test("CommonJS export is the sole global form under Node", () => {
  assert.equal(typeof loader.load, "function");
  assert.equal(typeof loader.validateData, "function");
  assert.deepEqual(loader.LAYER_NAMES, [
    "water",
    "buildings",
    "roads",
    "bridges",
  ]);
  // Importing must not leak a browser global.
  assert.equal(globalThis.AmsterdamGeoLoader, undefined);
});

test("repeated loads are independent and deterministic", async () => {
  const opts = {
    fetchImpl: fakeFetch(() => fakeResponse({ chunkSize: 256 })),
  };
  const [a, b] = await Promise.all([
    loader.load("https://example.test/sample-runtime.json.gz", opts),
    loader.load("https://example.test/sample-runtime.json.gz", opts),
  ]);
  // Independent loads produce identical objects, equal to the parsed asset.
  assert.deepEqual(a, b);
  assert.deepEqual(a, JSON.parse(JSON_BYTES.toString("utf-8")));
});

// -------------------------------------------------------------------------- //
// Actual HTTP semantics against an ephemeral loopback server and real fetch. //
// -------------------------------------------------------------------------- //
test("real HTTP: raw/query/hash .gz, pre-decoded content-encoding, split magic", async () => {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/boom")) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("nope");
      return;
    }
    if (url.startsWith("/chunky")) {
      // Transfer-Encoding: chunked, and the two gzip magic bytes arrive in
      // separate writes/chunks.
      res.writeHead(200, { "Content-Type": "application/gzip" });
      res.write(Buffer.from([GZIP_BYTES[0]]));
      setImmediate(() => {
        res.write(GZIP_BYTES.subarray(1, 64));
        for (let off = 64; off < GZIP_BYTES.length; off += 73) {
          res.write(
            GZIP_BYTES.subarray(off, Math.min(off + 73, GZIP_BYTES.length))
          );
        }
        res.end();
      });
      return;
    }
    if (url.startsWith("/plain")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON_BYTES);
      return;
    }
    const headers = { "Content-Type": "application/json" };
    if (url.startsWith("/encoded")) {
      // Real fetch decompresses this itself; the loader must see plain JSON
      // regardless of the surviving response header.
      headers["Content-Encoding"] = "gzip";
    }
    res.writeHead(200, headers);
    res.end(GZIP_BYTES);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  // The game integration declares this cap for the 140,520,240-byte asset;
  // prove an explicit large option works and the 128 MiB default stays.
  const large = { maxDecodedBytes: 192 * 1024 * 1024 };
  assert.equal(loader.DEFAULT_MAX_DECODED_BYTES, 128 * 1024 * 1024);
  try {
    const urls = [
      "/raw.gz",
      "/raw.gz?commit=parent",
      "/raw.gz?commit=parent#section",
      "/encoded.json",
      "/encoded.gz",
      "/encoded.gz?commit=parent",
      "/chunky.gz?x=1",
      "/plain.json",
    ];
    for (const route of urls) {
      const data = await loader.load(base + route, large);
      assertRealData(data);
    }
    // Relative URL handed to a fetchImpl that resolves a base (browser-style).
    const relative = await loader.load("/raw.gz?commit=parent", {
      fetchImpl: (u) => fetch(new URL(u, base).toString()),
      maxDecodedBytes: 192 * 1024 * 1024,
    });
    assertRealData(relative);
    await assert.rejects(loader.load(base + "/boom"), /HTTP error 503/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// -------------------------------------------------------------------------- //
// Strict frozen-schema validation.                                           //
// -------------------------------------------------------------------------- //
const SAMPLE_DATA = JSON.parse(JSON_BYTES.toString("utf-8"));

test("strict schema regressions rejected with feature identity", () => {
  // featureScoped cases must name the offending feature id; document-level
  // cases name the offending document part instead.
  const cases = [
    [
      "unclosed ring",
      (d) => d.layers.water[0].polygons[0][0].pop(),
      /exactly closed/,
      true,
    ],
    [
      "empty feature polygons",
      (d) => {
        d.layers.water[0].polygons = [];
      },
      /non-empty array/,
      true,
    ],
    [
      "ring with only two distinct vertices",
      (d) => {
        d.layers.water[0].polygons[0][0] = [
          [0, 0],
          [1, 0],
          [0, 0],
          [1, 0],
          [0, 0],
        ];
      },
      /3 distinct finite vertices/,
      true,
    ],
    [
      "string source.complete",
      (d) => {
        d.source.complete = "false";
      },
      /source.complete/,
      false,
    ],
    [
      "unsupported projection type",
      (d) => {
        d.projection.type = "wrong";
      },
      /projection type/,
      false,
    ],
    [
      "untruthful bounds",
      (d) => {
        d.layers.water[0].bounds = [0, 0, 0, 0];
      },
      /bounds/,
      true,
    ],
    [
      "missing sourceId",
      (d) => {
        delete d.layers.water[0].sourceId;
      },
      /sourceId/,
      true,
    ],
    [
      "numeric localId",
      (d) => {
        d.layers.water[0].localId = 7;
      },
      /localId/,
      true,
    ],
    [
      "blank source input file",
      (d) => {
        d.source.inputs[0].file = "";
      },
      /source.inputs/,
      false,
    ],
    [
      "misordered bbox",
      (d) => {
        d.bbox = [4.92, 52.36, 4.9, 52.38];
      },
      /bbox/,
      false,
    ],
  ];
  for (const [name, change, matcher, featureScoped] of cases) {
    const d = structuredClone(SAMPLE_DATA);
    const fid = d.layers.water[0].id;
    change(d);
    assert.throws(
      () => loader.validateData(d),
      (error) =>
        matcher.test(error.message) &&
        (!featureScoped || error.message.includes(fid)),
      name + " should reject clearly"
    );
  }
});

test("GEOS-invalid bowtie stays structurally valid (no category confusion)", () => {
  const d = structuredClone(SAMPLE_DATA);
  // polygons -> polygon -> ring nesting; a self-intersecting but closed ring
  // with four distinct finite vertices is structurally acceptable.
  d.layers.water[0].polygons = [
    [[[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]],
  ];
  d.layers.water[0].bounds = [0, 0, 10, 10];
  assert.doesNotThrow(() => loader.validateData(d));
});

test("malformed schema rejects through the full load path (real Response)", async () => {
  // Mirrors the parent probe: plain JSON body via a real Response object.
  const unclosed = structuredClone(SAMPLE_DATA);
  const fid = unclosed.layers.water[0].id;
  unclosed.layers.water[0].polygons[0][0].pop();
  await assert.rejects(
    loader.load("mock.json", {
      fetchImpl: async () =>
        new Response(JSON.stringify(unclosed), {
          headers: { "Content-Type": "application/json" },
        }),
    }),
    (error) =>
      error.message.includes(fid) && /exactly closed/.test(error.message)
  );

  const stringComplete = structuredClone(SAMPLE_DATA);
  stringComplete.source.complete = "false";
  await assert.rejects(
    loader.load("mock.json", {
      fetchImpl: async () =>
        new Response(JSON.stringify(stringComplete), {
          headers: { "Content-Type": "application/json" },
        }),
    }),
    /source.complete/
  );
});
