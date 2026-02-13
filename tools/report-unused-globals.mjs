import fs from "node:fs";
import path from "node:path";

const cssPath = "src/app/globals.css";
const srcRoot = "src";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const css = fs.readFileSync(cssPath, "utf8");

// 1) Extract all top-level class selectors we care about from globals.css
// Matches: .aura-foo, .gate-bar, including variants like __ and --
const selectorRe = /^\s*\.(aura|gate)-[a-z0-9_-]+(?:__[a-z0-9_-]+)?(?:--[a-z0-9_-]+)?\b/ig;
const selectors = new Set();
for (const line of css.split(/\r?\n/)) {
  const m = line.match(selectorRe);
  if (m) {
    // pull the first ".aura-..." token from the line
    const tok = line.trim().match(/^\.(aura|gate)-[a-z0-9_-]+(?:__[a-z0-9_-]+)?(?:--[a-z0-9_-]+)?/i);
    if (tok) selectors.add(tok[0].slice(1)); // without leading dot
  }
}

// 2) Read all source files (ts/tsx/js/jsx) and collect seen class-like tokens
const exts = new Set([".ts", ".tsx", ".js", ".jsx"]);
const files = walk(srcRoot).filter(f => exts.has(path.extname(f)));

const tokenRe = /\b(aura|gate)-[a-z0-9_-]+(?:__[a-z0-9_-]+)?(?:--[a-z0-9_-]+)?\b/ig;

const seenCounts = new Map(); // token -> count
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  const matches = txt.match(tokenRe);
  if (!matches) continue;
  for (const t of matches) {
    const key = t;
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }
}

// 3) Report selectors in CSS that are never seen in src/
const unused = [];
const used = [];

for (const sel of selectors) {
  const c = seenCounts.get(sel) ?? 0;
  if (c === 0) unused.push(sel);
  else used.push({ sel, c });
}

unused.sort();
used.sort((a, b) => b.c - a.c);

const lines = [];
lines.push(`globals.css selectors checked: ${selectors.size}`);
lines.push(`used in src/: ${used.length}`);
lines.push(`NOT referenced in src/: ${unused.length}`);
lines.push("");
lines.push("UNUSED (safe candidates to delete if truly not used dynamically):");
for (const s of unused) lines.push(`- .${s}`);
lines.push("");
lines.push("MOST USED (top 30):");
for (const u of used.slice(0, 30)) lines.push(`- .${u.sel}  (${u.c})`);

fs.writeFileSync("src/app/globals.unused.report.txt", lines.join("\n"), "utf8");
console.log("Wrote: src/app/globals.unused.report.txt");
console.log(`Unused selectors: ${unused.length} / ${selectors.size}`);
