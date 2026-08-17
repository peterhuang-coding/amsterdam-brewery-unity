# Credits & Data Sources

This prototype renders a stylised replica of central Amsterdam on top of the
existing roguelike game demo. The replica layer is built entirely from **public,
hand-curated** coordinate data; no proprietary GIS or commercial map tiles are
shipped with the bundle.

## Coordinate sources

### Wikipedia landmark coordinates (CC BY-SA)

The 30 landmarks (`tools/prototype/data/amsterdam_geo.js → LANDMARKS`) use
public Wikipedia coordinates for the most photographed sites in Amsterdam:

| id             | Wikipedia article                                       |
| -------------- | ------------------------------------------------------- |
| `rijksmuseum`  | https://en.wikipedia.org/wiki/Rijksmuseum               |
| `van_gogh`     | https://en.wikipedia.org/wiki/Van_Gogh_Museum           |
| `anne_frank`   | https://en.wikipedia.org/wiki/Anne_Frank_House          |
| `centraal`     | https://en.wikipedia.org/wiki/Amsterdam_Centraal_station|
| `dam_square`   | https://en.wikipedia.org/wiki/Dam_Square                |
| `vondelpark`   | https://en.wikipedia.org/wiki/Vondelpark                |
| `heineken`     | https://en.wikipedia.org/wiki/Heineken_Experience       |
| `jordaan`      | https://en.wikipedia.org/wiki/Jordaan                   |
| `de_pijp`      | https://en.wikipedia.org/wiki/De_Pijp                   |
| `ndsm`         | https://en.wikipedia.org/wiki/NDSM_werf                 |
| `plantage`     | https://en.wikipedia.org/wiki/Plantage                  |
| `ijburg`       | https://en.wikipedia.org/wiki/IJburg                    |
| `buiksloterham`| https://en.wikipedia.org/wiki/Buiksloterham             |
| `allard_pierson`| https://en.wikipedia.org/wiki/Allard_Pierson_(museum)  |
| `oosterpark`   | https://en.wikipedia.org/wiki/Oosterpark                |
| `westerpark`   | https://en.wikipedia.org/wiki/Westerpark                |
| `artis`        | https://en.wikipedia.org/wiki/Artis_(zoo)               |
| `albert_cuyp`  | https://en.wikipedia.org/wiki/Albert_Cuyp_Market       |
| `de_waag`      | https://en.wikipedia.org/wiki/Waag_(Amsterdam)          |
| `paleis`       | https://en.wikipedia.org/wiki/Royal_Palace_of_Amsterdam |
| `nieuwe_kerk`  | https://en.wikipedia.org/wiki/Nieuwe_Kerk,_Amsterdam    |
| `oude_kerk`    | https://en.wikipedia.org/wiki/Oude_Kerk,_Amsterdam      |
| `magna_plaza`  | https://en.wikipedia.org/wiki/Magna_Plaza               |
| `beurs_van_berlage`| https://en.wikipedia.org/wiki/Beurs_van_Berlage     |
| `stopera`      | https://en.wikipedia.org/wiki/Stopera                   |
| `paradiso`     | https://en.wikipedia.org/wiki/Paradiso_(Amsterdam)      |
| `melkweg`      | https://en.wikipedia.org/wiki/Melkweg_(venue)           |
| `foam`         | https://en.wikipedia.org/wiki/FOAM_(photography_museum) |
| `eye_filmmuseum`| https://en.wikipedia.org/wiki/Eye_Film_Institute_Netherlands |
| `hermitage`    | https://en.wikipedia.org/wiki/Hermitage_Amsterdam       |

Bridge coordinates (`BRIDGES`, 50 entries) come from the same Wikipedia pages,
either inline (e.g. Magere Brug, Blauwbrug, Torensluis, Paleisbrug) or from the
public Amsterdam bridge-numbering map maintained by the city's open-data
program. Bridges are named exactly as they appear on municipal signage.

### Islands (R5 — 30 entries, Wikipedia public coords)

The `ISLANDS` array covers the IJ river artificial islands (Westelijke
Eilanden, Oostelijke Eilanden, IJburg cluster), park islands (Vondelpark,
Oosterpark, Sarphati, Beatrix, Westerpark, Hermitage Tuin), the Watergraafsmeer
polder, and a handful of historic neighborhood "islands" enclosed by the
canal ring. Coords verified against each island's Wikipedia article and
constrained to the rendering bbox.

### Canal centerlines (hand-drawn)

The 9 canal polylines (`CANALS`) trace the historical centerlines of the
UNESCO-listed canal ring (Singel / Prinsengracht / Keizersgracht / Herengracht)
plus Amstel, IJ, Brouwersgracht, Leidsegracht, and Kloveniersburgwal. Each
polyline is 5 anchors; widths match the documented right-of-way width.

## Mini-game address bindings (`MINI_BINDINGS`)

The 6 mini-game venues are bound to public postal addresses with Wikipedia-
verifiable coordinates:

| industry        | venue                  | address                                             |
| --------------- | ---------------------- | --------------------------------------------------- |
| `brewing`       | Brouwerij De Pijl      | Warmoesstraat 19, 1012 JD Amsterdam                 |
| `coffee_shop`   | Noord Coffeeshop       | Van der Pekstraat 8, 1031 JP Amsterdam-Noord        |
| `smart_shop`    | Damstraat SmartShop    | Damstraat 22, 1012 JL Amsterdam                     |
| `surfing`       | Buiksloterham Surf     | Buiksloterham, 1034 Amsterdam-Noord                 |
| `academic`      | Allard Pierson (UvA)   | Oude Turfmarkt 127, 1012 GC Amsterdam               |
| `bar`           | Café Tweede Kans       | Warmoesstraat 19, 1012 JD Amsterdam                 |

All coords are inside the rendering bbox `{south:52.340, west:4.850, north:52.410,
east:4.965}` and within 1 km of a landmark (asserted by `test.html`).

## Projection

Equirectangular at ≈52.37°N with a scale of **12 m/px**. Distortion over the
7 × 7 km city bbox is < 0.3 %, well below one canvas pixel at the default fit.
Haversine distance is used for the ≥1 km sanity check.

## Code provenance

All renderer / data / test code in `tools/prototype/` was authored for this
project. No third-party map libraries are bundled.

## Acknowledgements

- **Wikipedia** — public landmark coordinates and naming
- **Gemeente Amsterdam open data** — bridge inventory (Brug 112, Brug 119, etc.)
- **OSM Overpass** — schema reference for the canal polyline structure (not
  bundled; coordinates are hand-curated)

If you spot a coordinate error, please file an issue with the OSM node id and
the landmark id and we'll reconcile.

## License

Code: MIT (matches the parent repo). Coordinate data: public-domain (Wikipedia
coordinates are CC BY-SA; this prototype is non-commercial and attributes).
