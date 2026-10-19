# BGT polygon navigation component

Adopted byte-for-byte from Coding Plan `amsterdam-d26-geo-navigation-r3-20261017` under the D27 six-hour authorization. The three implementation/test/benchmark files and three public fixtures retain their returned bytes. Parent review is in `docs/product-research/2026-10-20-six-hour-map/NAV01/r3-review` on the research branch.

43 tests, independent GEOS 3000 cases, 60 translation/rotation cases and 7 road-class checks pass. Full original-source pub-to-coffee route has 72 independently safe segments and 3118.969343 m length. This does not establish all-venue reachability or suitable interactive latency: that query took 124.6 seconds and existing caches are unbounded. The authorized loading/integration work must provide bounded memory and non-blocking route handling before gameplay adoption.

Run `node --test test-geo-navigation.cjs` and `node benchmark-geo-navigation.cjs` here. This standalone component is not yet wired into the game. Prior rejected attempts remain recorded; the one explicitly approved extra correction is consumed.
