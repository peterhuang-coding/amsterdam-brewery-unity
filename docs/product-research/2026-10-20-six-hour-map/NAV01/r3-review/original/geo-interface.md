# D26 real-geography interface v1 (frozen for this wave)
Baseline game dad6b38c54fda94f541764242f61820d8177bd19. New human authorization D26: resume the Amsterdam map for ten hours, UTC 2026-10-16T16:03:03Z to 2026-10-17T02:03:03Z. Earlier MAP01/MAP02 design failures remain failures; these are newly authorized implementation units under F02, not a reset of their history.

## Chosen approach and boundaries
Use public Netherlands Kadaster/PDOK BGT polygon geometry. Official source https://api.pdok.nl/kadaster/bgt/ogc/v1?f=html&lang=nl reports CC0 1.0. Relevant collections waterdeel, pand, wegdeel, overbruggingsdeel. Actual OpenAPI uses datetime (NOT peildatum). Snapshot 2026-10-16T00:00:00Z. Raw source coordinates CRS84 [longitude, latitude]. Parent downloads pages and verifies their source; executor has no network.
Full target bbox [4.865,52.345,4.970,52.405]. Samples cover a smaller area and are explicitly incomplete. Do not label sample counts as complete city coverage. Preserve all coordinate rings and source IDs; no invented canals or buildings. Geometric metre scale is distinct from accelerated game travel, stylized avatars, fictional venue placement and incomplete facade details.

## Shared output schema (plain JSON, and browser/CommonJS wrapper of identical object)
{
 schemaVersion:1,
 bbox:[west,south,east,north],
 projection:{type:"local-equirectangular",originLon:west,originLat:north,referenceLat:(south+north)/2,radiusMeters:6371008.8,units:"metres"},
 width:R*cos(referenceLat)*radians(east-west),height:R*radians(north-south),
 source:{provider:"Kadaster / PDOK BGT",url:"https://api.pdok.nl/kadaster/bgt/ogc/v1/",license:"CC0-1.0",snapshot:"2026-10-16T00:00:00Z",complete:false,inputs:[{file,sha256,collection}],limitations:[...]},
 layers:{water:[],buildings:[],roads:[],bridges:[]}
}
Each layer feature: {id:"collection:source-feature-id",sourceId:"raw feature id",localId:"properties.lokaal_id or null",properties:{...selected original properties},polygons:[ [outerRing,holeRing,...], ... ],bounds:[minX,minY,maxX,maxY]}.
Each ring is an array of [x,y], closed with exact repeated first coordinate, at least three distinct finite points. Projection x=R*cos(referenceLatRadians)*(lon-originLon)*PI/180; y=R*(originLat-lat)*PI/180. Round output metres to 3 decimals. No simplification or silent repair of invalid geometry. Source geometries intersecting bbox may extend outside it; retain full polygons and let renderer clip. bounds must describe actual projected polygons, not force geometry into bbox.
Keep properties: status, creation_date, termination_date, tijdstip_registratie, eind_registratie, relatieve_hoogteligging, functie, fysiek_voorkomen, type, type_overbruggingsdeel, hoort_bij_typeoverbrugging, bag_pnd (when present). All source entries finite/valid. Polygon and MultiPolygon supported, holes preserved, invalid entries fail with IDs rather than silently fill them. Identical repeated features from pages dedup; conflicting duplicate IDs or duplicate localId versions require explicit resolution/error, never silent last-wins.
UMD exports globalThis.AmsterdamGeoData / module.exports. No DOM or dependencies.

## Geometry/navigation interface (separate independent implementation)
UMD globalThis.AmsterdamGeoNavigation / module.exports.
Exports project(lon,lat,projection), unproject(x,y,projection), pointInPolygon(point,polygon), createNavigator(data, options).
Point objects {x,y}. project/unproject round-trip within 1e-7 degrees. pointInPolygon honors all holes; boundary is inside outer, hole boundary excluded.
createNavigator options: cellSize default2 metres, maxNodes default250000, bucketSize default64, radius default0 (point actor; actual integration may choose positive radius). No eagerly allocated multi-million object grids.
Instance:
- isWalkable(point,{mode:"walk"|"bike",radius}={}) -> boolean.
- segmentWalkable(from,to,options={}) -> boolean. No corner cutting, thin-water teleport, or hole filling. Sample spacing <=0.5 metres AND polygon/segment intersection awareness so sub-step thin barriers cannot be jumped.
- snap(point,{mode,maxDistance=80,radius}={}) -> {x,y,distance}|null; bounded nearest reachable surface search, deterministic. No unbounded scan.
- route(from,to,{mode,maxNodes,radius,snapDistance=0}={}) -> {found,reason,points:[{x,y}],length,visited,startSnap,endSnap}. reasons "ok","invalid","unwalkable","unreachable","limit". points include actual endpoints on success, each segment passes segmentWalkable. snapDistance defaults0: never silently move caller. Explicit snapDistance>0 may snap invalid endpoints within bound and must return startSnap/endSnap. Same valid point returns length0 / found true. Disconnected islands return unreachable. Use A* and sparse cached passability/spatial buckets, deterministic tie breaks, explicit search budget. No straight shortcut across water/buildings. Route can simplify collinear segments only after checking safety.
- stats() -> useful counts/cache/search observations for parent measurement, not made-up performance claims.
Physical gameplay policy: require point on a road polygon or actual bridge deck (type_overbruggingsdeel==="dek"), reject buildings; water rejects except on actual bridge deck. Piers/pillars never override water. Exclude road functie autosnelweg, autoweg, spoorbaan, OV-baan, baan voor vliegverkeer. Walk permits other road types. Bike additionally rejects voetpad, voetpad op trap, voetgangergebied, ruiterpad unless future explicit game rules change it; do not claim legal cycling navigation. Radius>0 means circle clearance against boundaries/obstacles, not only centre. Respect hole/water/roof geometry. No invented ferry segments in this package; IJ crossing is a later explicit transit integration task with sourced endpoints, not walkable water.
No game/index/UI changes in either package. No external installs/network/credentials/git commits. Parent independently tests and adopts.

## Parent integration sequence (not executor scope)
Import full source pages with accepted converter; inspect full actual map; validate realistic anchor positions and snap to road surfaces; adopt independent modules only after parent review. Then separate contract replaces reopening-city rectangular geometry and scene drawing, updates UI save migration, handles explicit ferry transit, keyboard/390px and continuous first cup -> night goods -> actual return -> day2 consequence. New play service uses adopted commit bytes. Existing dad6b38 play/save stays preserved.
