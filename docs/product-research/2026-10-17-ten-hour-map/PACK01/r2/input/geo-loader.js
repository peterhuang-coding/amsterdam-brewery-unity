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
     * deviation; never substitutes data.
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
      var projection = data.projection;
      if (!projection || typeof projection !== "object") {
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
      if (
        !isFiniteNumber(data.width) ||
        data.width <= 0 ||
        !isFiniteNumber(data.height) ||
        data.height <= 0
      ) {
        throw new Error("geo-loader: width/height must be positive numbers");
      }
      if (!data.source || typeof data.source !== "object") {
        throw new Error("geo-loader: source provenance object is required");
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
        features.forEach(function (feature) {
          if (!feature || typeof feature !== "object") {
            throw new Error(
              "geo-loader: non-object feature in layer '" + layerName + "'"
            );
          }
          if (typeof feature.id !== "string" || !feature.id) {
            throw new Error(
              "geo-loader: feature missing string id in layer '" +
                layerName +
                "'"
            );
          }
          if (!Array.isArray(feature.polygons)) {
            throw new Error(
              "geo-loader: feature '" +
                feature.id +
                "' has no polygons array"
            );
          }
          feature.polygons.forEach(function (polygon, polygonIndex) {
            if (!Array.isArray(polygon) || polygon.length === 0) {
              throw new Error(
                "geo-loader: feature '" +
                  feature.id +
                  "' polygon " +
                  polygonIndex +
                  " is malformed"
              );
            }
            polygon.forEach(function (ring, ringIndex) {
              if (
                !Array.isArray(ring) ||
                ring.length < 4 ||
                !ring.every(function (point) {
                  return (
                    Array.isArray(point) &&
                    point.length === 2 &&
                    isFiniteNumber(point[0]) &&
                    isFiniteNumber(point[1])
                  );
                })
              ) {
                throw new Error(
                  "geo-loader: feature '" +
                    feature.id +
                    "' polygon " +
                    polygonIndex +
                    " ring " +
                    ringIndex +
                    " is not a closed finite coordinate ring"
                );
              }
            });
          });
          if (
            !Array.isArray(feature.bounds) ||
            feature.bounds.length !== 4 ||
            !feature.bounds.every(isFiniteNumber)
          ) {
            throw new Error(
              "geo-loader: feature '" + feature.id + "' has invalid bounds"
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
     * Fetch, optionally gunzip (content-encoding: gzip or .gz URL), bound
     * decoded bytes, parse and validate. Resolves with the plain data object.
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

      var decodeGzip = false;
      var pumpPromise = null;

      function finishFailure(error) {
        // drainBounded already cancelled the reader it owns; for gzip,
        // wait for the source->decompressor pump to wind down (it aborts
        // its writer when the decompressed side errors).
        var settled = pumpPromise
          ? pumpPromise.catch(function () {})
          : Promise.resolve();
        return settled.then(function () {
          throw error;
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
          var encoding = String(
            headerGet(response.headers, "content-encoding") || ""
          ).toLowerCase();
          decodeGzip =
            encoding.indexOf("gzip") !== -1 ||
            url.toLowerCase().indexOf(".gz") === url.length - 3;

          var readable = response.body;
          if (decodeGzip) {
            if (typeof DecompressionStream !== "function") {
              throw new Error(
                "geo-loader: DecompressionStream('gzip') is unavailable"
              );
            }
            var decompressor = new DecompressionStream("gzip");
            var writer = decompressor.writable.getWriter();
            var sourceReader = response.body.getReader();
            pumpPromise = (function () {
              function pump() {
                return sourceReader.read().then(function (result) {
                  if (result.done) {
                    return writer.close();
                  }
                  return writer.write(result.value).then(pump);
                });
              }
              return pump().then(
                function () {
                  try {
                    sourceReader.releaseLock();
                  } catch (error) {
                    /* ignore */
                  }
                },
                function (error) {
                  return Promise.resolve()
                    .then(function () {
                      return writer.abort(error);
                    })
                    .catch(function () {
                      /* ignore */
                    })
                    .then(function () {
                      try {
                        sourceReader.releaseLock();
                      } catch (releaseError) {
                        /* ignore */
                      }
                      throw error;
                    });
                }
              );
            })();
            readable = decompressor.readable;
          }
          return drainBounded(readable, maxBytes).then(
            function (bytes) {
              if (decodeGzip) {
                return pumpPromise.then(
                  function () {
                    return bytes;
                  },
                  function (error) {
                    throw new Error(
                      "geo-loader: gzip decode failed: " +
                        messageOf(error, "stream error")
                    );
                  }
                );
              }
              return bytes;
            },
            function (error) {
              // Drain/read failure: cancel everything, then surface a
              // decode-tagged error for gzip streams.
              var wrapped = decodeGzip
                ? new Error(
                    /exceeds maxDecodedBytes/.test(
                      messageOf(error, "")
                    )
                      ? messageOf(error)
                      : "geo-loader: gzip decode failed: " +
                          messageOf(error, "stream error")
                  )
                : error;
              return finishFailure(wrapped);
            }
          );
        })
        .then(function (bytes) {
          var text;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch (error) {
            throw new Error(
              "geo-loader: asset is not valid UTF-8: " +
                messageOf(error, "decode error")
            );
          }
          var parsed;
          try {
            parsed = JSON.parse(text);
          } catch (error) {
            throw new Error(
              "geo-loader: asset is not valid JSON: " +
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
          // Works for pre-stream failures (HTTP status) too: with no pump it
          // simply rethrows after no-op cleanup.
          return finishFailure(error);
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
