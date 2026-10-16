/*!
 * D26 PACK01 AmsterdamGeoLoader
 *
 * UMD loader for the frozen v1 real-geography runtime asset
 * (see geo-interface.md). Browser usage:
 *
 *   <script src="geo-loader.js"></script>
 *   const data = await AmsterdamGeoLoader.load(url);
 *
 * CommonJS usage:
 *
 *   const AmsterdamGeoLoader = require('./geo-loader.js');
 *   const data = await AmsterdamGeoLoader.load(url, { fetchImpl, maxDecodedBytes });
 *
 * Properties:
 *   - native fetch + DecompressionStream('gzip') only; no dependencies;
 *   - decoded size is bounded (default 128 MiB) while streaming;
 *   - response.ok, gzip and JSON/schema failures reject explicitly;
 *   - no fetch happens merely by importing this module;
 *   - no eval / no executable bundled data; on failure nothing old or
 *     hand-drawn is silently substituted.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    global.AmsterdamGeoLoader = factory();
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
      ? self
      : this,
  function () {
    "use strict";

    var DEFAULT_MAX_DECODED_BYTES = 128 * 1024 * 1024; // 128 MiB
    var LAYER_NAMES = ["water", "buildings", "roads", "bridges"];
    var SCHEMA_VERSION = 1;

    function isFiniteNumber(value) {
      return typeof value === "number" && Number.isFinite(value);
    }

    function messageOf(error, fallback) {
      if (error && typeof error.message === "string" && error.message) {
        return error.message;
      }
      if (typeof error === "string" && error) {
        return error;
      }
      return fallback;
    }

    function headerGet(headers, name) {
      if (!headers) {
        return null;
      }
      if (typeof headers.get === "function") {
        try {
          return headers.get(name);
        } catch (error) {
          return null;
        }
      }
      var lower = String(name).toLowerCase();
      if (headers[lower] != null) {
        return headers[lower];
      }
      if (headers[name] != null) {
        return headers[name];
      }
      return null;
    }

    /**
     * Structural validation of the frozen v1 schema. Throws Error on any
     * deviation (naming the offending feature); never substitutes data.
     * GEOS-invalid-but-structurally-sound source polygons (e.g. bowties that
     * fell back unchanged) are NOT rejected here: exact closure, three
     * distinct finite vertices and truthful bounds are structural facts,
     * self-intersection is a separate geometry-level category.
     */
    function validateData(data) {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("geo-loader: decoded asset is not a JSON object");
      }
      if (data.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(
          "geo-loader: unsupported schemaVersion " +
            String(data.schemaVersion)
        );
      }
      var bbox = data.bbox;
      if (
        !Array.isArray(bbox) ||
        bbox.length !== 4 ||
        !bbox.every(isFiniteNumber)
      ) {
        throw new Error("geo-loader: bbox must be four finite numbers");
      }
      if (!(bbox[0] <= bbox[2] && bbox[1] <= bbox[3])) {
        throw new Error(
          "geo-loader: bbox must be ordered [west,south,east,north]"
        );
      }
      var projection = data.projection;
      if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
        throw new Error("geo-loader: projection object is required");
      }
      if (projection.type !== "local-equirectangular") {
        throw new Error(
          "geo-loader: unsupported projection type " +
            String(projection.type)
        );
      }
      if (projection.units !== "metres") {
        throw new Error("geo-loader: projection.units must be 'metres'");
      }
      [
        "originLon",
        "originLat",
        "referenceLat",
        "radiusMeters",
      ].forEach(function (key) {
        if (!isFiniteNumber(projection[key])) {
          throw new Error(
            "geo-loader: projection." + key + " must be a finite number"
          );
        }
      });
      if (projection.radiusMeters <= 0) {
        throw new Error("geo-loader: projection.radiusMeters must be positive");
      }
      if (
        !isFiniteNumber(data.width) ||
        data.width <= 0 ||
        !isFiniteNumber(data.height) ||
        data.height <= 0
      ) {
        throw new Error("geo-loader: width/height must be positive numbers");
      }
      var source = data.source;
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error("geo-loader: source provenance object is required");
      }
      ["provider", "url", "license", "snapshot"].forEach(function (key) {
        if (typeof source[key] !== "string" || source[key].length === 0) {
          throw new Error(
            "geo-loader: source." + key + " must be a non-empty string"
          );
        }
      });
      if (typeof source.complete !== "boolean") {
        throw new Error(
          "geo-loader: source.complete must be a boolean, got " +
            typeof source.complete
        );
      }
      if (!Array.isArray(source.inputs)) {
        throw new Error("geo-loader: source.inputs must be an array");
      }
      source.inputs.forEach(function (entry, entryIndex) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error(
            "geo-loader: source.inputs[" + entryIndex + "] must be an object"
          );
        }
        ["file", "sha256", "collection"].forEach(function (key) {
          if (typeof entry[key] !== "string" || entry[key].length === 0) {
            throw new Error(
              "geo-loader: source.inputs[" +
                entryIndex +
                "]." +
                key +
                " must be a non-empty string"
            );
          }
        });
      });
      if (
        source.limitations !== undefined &&
        (
          !Array.isArray(source.limitations) ||
          !source.limitations.every(function (item) {
            return typeof item === "string";
          })
        )
      ) {
        throw new Error(
          "geo-loader: source.limitations must be an array of strings"
        );
      }
      var layers = data.layers;
      if (!layers || typeof layers !== "object" || Array.isArray(layers)) {
        throw new Error("geo-loader: layers object is required");
      }
      LAYER_NAMES.forEach(function (layerName) {
        var features = layers[layerName];
        if (!Array.isArray(features)) {
          throw new Error("geo-loader: layer '" + layerName + "' is missing");
        }
        features.forEach(function (feature, featureIndex) {
          var where =
            "feature index " +
            featureIndex +
            " in layer '" +
            layerName +
            "'";
          if (!feature || typeof feature !== "object" || Array.isArray(feature)) {
            throw new Error("geo-loader: non-object " + where);
          }
          if (typeof feature.id !== "string" || !feature.id) {
            throw new Error(
              "geo-loader: " + where + " is missing a string id"
            );
          }
          var fid = feature.id;
          if (typeof feature.sourceId !== "string" || !feature.sourceId) {
            throw new Error(
              "geo-loader: feature '" +
                fid +
                "' is missing string sourceId"
            );
          }
          if (
            !Object.prototype.hasOwnProperty.call(feature, "localId") ||
            !(feature.localId === null || typeof feature.localId === "string") ||
            (typeof feature.localId === "string" && !feature.localId)
          ) {
            throw new Error(
              "geo-loader: feature '" + fid + "' localId must be string|null"
            );
          }
          if (
            !Object.prototype.hasOwnProperty.call(feature, "properties") ||
            !feature.properties ||
            typeof feature.properties !== "object" ||
            Array.isArray(feature.properties)
          ) {
            throw new Error(
              "geo-loader: feature '" + fid + "' properties must be an object"
            );
          }
          if (!Array.isArray(feature.polygons) || feature.polygons.length === 0) {
            throw new Error(
              "geo-loader: feature '" +
                fid +
                "' polygons must be a non-empty array"
            );
          }
          var minX = Infinity;
          var minY = Infinity;
          var maxX = -Infinity;
          var maxY = -Infinity;
          feature.polygons.forEach(function (polygon, polygonIndex) {
            if (!Array.isArray(polygon) || polygon.length === 0) {
              throw new Error(
                "geo-loader: feature '" +
                  fid +
                  "' polygon " +
                  polygonIndex +
                  " is malformed"
              );
            }
            polygon.forEach(function (ring, ringIndex) {
              var role =
                ringIndex === 0 ? "outer ring" : "hole ring " + ringIndex;
              if (!Array.isArray(ring) || ring.length < 4) {
                throw new Error(
                  "geo-loader: feature '" +
                    fid +
                    "' polygon " +
                    polygonIndex +
                    " " +
                    role +
                    ": closed ring needs at least 4 coordinate tuples"
                );
              }
              var first = ring[0];
              var last = ring[ring.length - 1];
              if (
                !Array.isArray(first) ||
                first.length !== 2 ||
                !Array.isArray(last) ||
                last.length !== 2 ||
                first[0] !== last[0] ||
                first[1] !== last[1]
              ) {
                throw new Error(
                  "geo-loader: feature '" +
                    fid +
                    "' polygon " +
                    polygonIndex +
                    " " +
                    role +
                    " is not exactly closed (first != last)"
                  );
              }
              var distinct = Object.create(null);
              var distinctCount = 0;
              ring.forEach(function (point, pointIndex) {
                if (
                  !Array.isArray(point) ||
                  point.length !== 2 ||
                  !isFiniteNumber(point[0]) ||
                  !isFiniteNumber(point[1])
                ) {
                  throw new Error(
                    "geo-loader: feature '" +
                      fid +
                      "' polygon " +
                      polygonIndex +
                      " " +
                      role +
                      " coord " +
                      pointIndex +
                      " must be two finite numbers"
                  );
                }
                var key = point[0] + "," + point[1];
                if (!Object.prototype.hasOwnProperty.call(distinct, key)) {
                  distinct[key] = true;
                  distinctCount += 1;
                }
                if (point[0] < minX) minX = point[0];
                if (point[1] < minY) minY = point[1];
                if (point[0] > maxX) maxX = point[0];
                if (point[1] > maxY) maxY = point[1];
              });
              if (distinctCount < 3) {
                throw new Error(
                  "geo-loader: feature '" +
                    fid +
                    "' polygon " +
                    polygonIndex +
                    " " +
                    role +
                    " needs at least 3 distinct finite vertices"
                );
              }
            });
          });
          var bounds = feature.bounds;
          if (
            !Array.isArray(bounds) ||
            bounds.length !== 4 ||
            !bounds.every(isFiniteNumber)
          ) {
            throw new Error(
              "geo-loader: feature '" +
                fid +
                "' has invalid bounds; expected four finite numbers"
            );
          }
          if (!(bounds[0] <= bounds[2] && bounds[1] <= bounds[3])) {
            throw new Error(
              "geo-loader: feature '" + fid + "' bounds must be ordered"
            );
          }
          if (
            bounds[0] !== minX ||
            bounds[1] !== minY ||
            bounds[2] !== maxX ||
            bounds[3] !== maxY
          ) {
            throw new Error(
              "geo-loader: feature '" +
                fid +
                "' bounds do not match its polygon coordinates"
            );
          }
        });
      });
    }

    function concatChunks(chunks, totalLength) {
      var merged = new Uint8Array(totalLength);
      var offset = 0;
      chunks.forEach(function (chunk) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      });
      return merged;
    }

    /**
     * Read a ReadableStream to completion, bounding decoded byte count.
     * Readers/cancellations are released whether or not this succeeds.
     */
    function drainBounded(readable, maxBytes) {
      var reader = readable.getReader();
      var chunks = [];
      var total = 0;
      function cancelAndRelease(error) {
        return Promise.resolve()
          .then(function () {
            return reader.cancel(error);
          })
          .catch(function () {
            /* cancellation best-effort */
          })
          .then(function () {
            try {
              reader.releaseLock();
            } catch (releaseError) {
              /* already released */
            }
            throw error;
          });
      }
      function next() {
        return reader.read().then(function (result) {
          if (result.done) {
            try {
              reader.releaseLock();
            } catch (releaseError) {
              /* already released */
            }
            return concatChunks(chunks, total);
          }
          var chunk =
            result.value instanceof Uint8Array
              ? result.value
              : new Uint8Array(result.value);
          total += chunk.byteLength;
          if (total > maxBytes) {
            var limitError = new Error(
              "geo-loader: decoded size " +
                total +
                " bytes exceeds maxDecodedBytes " +
                maxBytes
            );
            return cancelAndRelease(limitError);
          }
          chunks.push(chunk);
          return next();
        });
      }
      return next().catch(function (error) {
        if (error && /exceeds maxDecodedBytes/.test(error.message)) {
          throw error;
        }
        return cancelAndRelease(error);
      });
    }

    /**
     * Read just enough of a response body to see the first two raw bytes.
     *
     * Gzip members always start with magic 0x1f 0x8b and JSON text can never
     * do so; therefore the body itself, not Content-Encoding headers or the
     * (possibly query/hash suffixed) URL, decides whether to gunzip. Native
     * fetch already decompresses Content-Encoding: gzip responses, in which
     * case the bytes arriving here are plain JSON even though the response
     * header remains. The buffered chunks are replayed so no data is lost,
     * including deliveries where the two magic bytes arrive separately.
     */
    function sniffBody(body) {
      var reader = body.getReader();
      var buffered = [];
      var total = 0;

      function readPrefix() {
        return reader.read().then(function (result) {
          if (result.done) {
            return true;
          }
          var chunk =
            result.value instanceof Uint8Array
              ? result.value
              : new Uint8Array(result.value);
          buffered.push(chunk);
          total += chunk.byteLength;
          if (total >= 2) {
            return false;
          }
          return readPrefix();
        });
      }

      function createReplay(alreadyDone) {
        var index = 0;
        return new ReadableStream({
          pull: function (controller) {
            if (index < buffered.length) {
              controller.enqueue(buffered[index]);
              index += 1;
              return undefined;
            }
            if (alreadyDone) {
              try {
                reader.releaseLock();
              } catch (error) {
                /* already released */
              }
              controller.close();
              return undefined;
            }
            return reader.read().then(
              function (result) {
                if (result.done) {
                  try {
                    reader.releaseLock();
                  } catch (error) {
                    /* already released */
                  }
                  controller.close();
                  return undefined;
                }
                controller.enqueue(
                  result.value instanceof Uint8Array
                    ? result.value
                    : new Uint8Array(result.value)
                );
                return undefined;
              },
              function (error) {
                try {
                  reader.releaseLock();
                } catch (releaseError) {
                  /* already released */
                }
                controller.error(error);
              }
            );
          },
          cancel: function (reason) {
            if (alreadyDone) {
              return undefined;
            }
            return Promise.resolve()
              .then(function () {
                return reader.cancel(reason);
              })
              .catch(function () {
                /* cancellation best-effort */
              })
              .then(function () {
                try {
                  reader.releaseLock();
                } catch (error) {
                  /* already released */
                }
              });
          },
        });
      }

      return readPrefix().then(function (alreadyDone) {
        var first = [];
        for (var i = 0; i < buffered.length && first.length < 2; i += 1) {
          for (
            var j = 0;
            j < buffered[i].byteLength && first.length < 2;
            j += 1
          ) {
            first.push(buffered[i][j]);
          }
        }
        return {
          isGzip:
            first.length >= 2 && first[0] === 0x1f && first[1] === 0x8b,
          empty: total === 0,
          replay: createReplay(alreadyDone),
        };
      });
    }

    /**
     * Fetch, detect raw gzip from actual body bytes, optionally gunzip, bound
     * decoded bytes, parse and validate. Relative/absolute URLs with query or
     * hash parts are passed through untouched. Resolves with the plain data
     * object; every failure rejects explicitly and releases the stream.
     */
    function load(url, options) {
      options = options || {};
      var maxBytes =
        options.maxDecodedBytes === undefined
          ? DEFAULT_MAX_DECODED_BYTES
          : options.maxDecodedBytes;
      if (!isFiniteNumber(maxBytes) || maxBytes <= 0) {
        return Promise.reject(
          new TypeError("geo-loader: maxDecodedBytes must be a positive finite number")
        );
      }
      if (typeof url !== "string" || url.length === 0) {
        return Promise.reject(
          new TypeError("geo-loader: url must be a non-empty string")
        );
      }
      var fetchImpl =
        options.fetchImpl ||
        (typeof globalThis !== "undefined" ? globalThis.fetch : undefined);
      if (typeof fetchImpl !== "function") {
        return Promise.reject(
          new Error("geo-loader: no fetch implementation available")
        );
      }

      // Per-call stream state; separate load() calls never share it.
      var sniffed = null;

      function cleanup(error) {
        var replay = sniffed ? sniffed.replay : null;
        sniffed = null;
        if (!replay) {
          return Promise.resolve();
        }
        return Promise.resolve()
          .then(function () {
            return replay.cancel(error);
          })
          .catch(function () {
            /* cancellation best-effort */
          });
      }

      return Promise.resolve()
        .then(function () {
          return fetchImpl(url);
        })
        .then(function (response) {
          if (!response || response.ok !== true) {
            var status = response && response.status;
            throw new Error(
              "geo-loader: HTTP error" +
                (status ? " " + status : "") +
                " while fetching " +
                url
            );
          }
          if (!response.body) {
            throw new Error(
              "geo-loader: response has no readable stream body"
            );
          }
          return sniffBody(response.body);
        })
        .then(function (info) {
          sniffed = info;
          var readable = info.replay;
          var isGzip = info.isGzip;
          if (isGzip) {
            if (typeof DecompressionStream !== "function") {
              throw new Error(
                "geo-loader: DecompressionStream('gzip') is unavailable"
              );
            }
            // pipeThrough propagates cancellation/errors both ways: a byte
            // bound error cancels the decompressor which aborts the replay
            // stream and cancels the underlying response reader.
            readable = info.replay.pipeThrough(
              new DecompressionStream("gzip")
            );
          }
          return drainBounded(readable, maxBytes).then(
            function (bytes) {
              return { bytes: bytes, isGzip: isGzip };
            },
            function (error) {
              if (
                isGzip &&
                !/exceeds maxDecodedBytes/.test(messageOf(error, ""))
              ) {
                throw new Error(
                  "geo-loader: gzip decode failed: " +
                    messageOf(error, "stream error")
                );
              }
              throw error;
            }
          );
        })
        .then(function (result) {
          var bytes = result.bytes;
          var text;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch (error) {
            throw new Error(
              "geo-loader: asset decode failed: body is not valid UTF-8: " +
                messageOf(error, "decode error")
            );
          }
          var parsed;
          try {
            parsed = JSON.parse(text);
          } catch (error) {
            throw new Error(
              "geo-loader: asset decode failed: body is not valid JSON: " +
                messageOf(error, "parse error")
            );
          }
          try {
            validateData(parsed);
          } catch (error) {
            throw new Error(messageOf(error, "schema validation failed"));
          }
          return parsed;
        })
        .catch(function (error) {
          // Releases/cancels the underlying reader on every failure path;
          // a fully consumed stream's cancel() is simply a no-op.
          return cleanup(error).then(function () {
            throw error;
          });
        });
    }

    return {
      load: load,
      validateData: validateData,
      DEFAULT_MAX_DECODED_BYTES: DEFAULT_MAX_DECODED_BYTES,
      SCHEMA_VERSION: SCHEMA_VERSION,
      LAYER_NAMES: LAYER_NAMES.slice(),
    };
  }
);
