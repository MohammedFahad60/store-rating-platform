/**
 * Minimal structured logger.
 *
 * One JSON line per event with stable keys, suitable for managed log
 * collectors (Render/Railway/AWS CloudWatch/Netlify). NEVER logs request
 * bodies, Authorization headers, passwords, JWTs or database credentials.
 */
const crypto = require("crypto");

const SILENT_ENVS = new Set(["test"]);
const isSilent = SILENT_ENVS.has(String(process.env.NODE_ENV || ""));

function line(level, event, fields = {}) {
  if (isSilent) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const text = JSON.stringify(record);
  if (level === "error") console.error(text);
  else console.log(text);
}

/** Attach a request id to every request (X-Request-Id header + req.id). */
function requestContext(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "");
  const requestId = /^[A-Za-z0-9_-]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

/** Log method, path, status and duration; never logs query secrets or bodies. */
function httpLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    line("info", "http.request", {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
}

module.exports = { line, requestContext, httpLogger, SILENT_ENVS };
