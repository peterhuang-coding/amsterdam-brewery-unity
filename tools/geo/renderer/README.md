# Standalone BGT Canvas renderer

Accepted from Coding Plan task `amsterdam-d26-geo-map-renderer-r3-20261017` after independent parent validation on 2026-10-17. Module, demo, tests, benchmark and public sample are byte-for-byte worker artifacts. Parent added this provenance note only.

Serve this directory over HTTP and open `renderer-demo.html`. It renders the supplied 62-feature local diagnostic subset (63 polygons); it is not the game or the complete map. The geometry source is Kadaster / PDOK BGT, CC0. Game venues are fictional.

Run `node --test test-geo-map-renderer.cjs` and `node benchmark-geo-map-renderer.cjs`. Parent independently passed 43 tests, checked the actual demo at DPR 1/2 through static frames, viewport resize and controls, and inspected a separate 145,703-feature Canvas fixture. That full fixture used a rejected data-pack candidate for renderer comparison only; its data correctness and memory cost are not approved by this renderer acceptance.

The module exports `AmsterdamGeoRenderer.create`, the frozen draw API, and frame-sizing helpers. Its demo pins a CSS content-box height before synchronizing backing pixels. Keep borders and padding out of drawing dimensions. The caller owns DPR and click-coordinate transforms.

The existing playable prototype does not load this component. Navigation and runtime packing remain unresolved dependencies; City/BOOT integration and natural game-flow validation remain unfinished. Historical RENDER business/R2 rejections are retained. Detailed parent evidence is maintained under `docs/product-research/2026-10-17-ten-hour-map/RENDER01/r3-review` on the documentation branch.
