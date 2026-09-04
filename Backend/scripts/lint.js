/**
 * Backend static check.
 *
 * Runs `node --check` over every Backend source file. This catches syntax
 * errors and malformed module code before the test suite boots the server.
 * (The Backend intentionally stays dependency-light: no ESLint toolchain,
 * keeping the runtime footprint of the platform minimal.)
 *
 * Usage: npm run lint   (from Backend/)
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "data"]);

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith(".js")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = collect(ROOT).sort();
let failures = 0;

for (const file of files) {
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  const rel = path.relative(ROOT, file);
  if (res.status === 0) {
    console.log(`  ok    ${rel}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${rel}`);
    console.error(res.stderr || res.stdout);
  }
}

console.log(`\n${files.length - failures}/${files.length} Backend files pass syntax check`);
if (failures > 0) process.exit(1);
