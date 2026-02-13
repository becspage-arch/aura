import fs from "node:fs";

const inPath = "src/app/globals.css";
const outPath = "src/app/globals.deduped.css";
const reportPath = "src/app/globals.deduped.report.txt";

const css = fs.readFileSync(inPath, "utf8");
const lines = css.split(/\r?\n/);

// Track top-level blocks only (nesting depth 0)
let depth = 0;

// record blocks: selector -> array of {startLine, endLine, startIdx, endIdx}
const blocksBySel = new Map();

// helper to compute char index from line/col
const lineStartIdx = [];
{
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStartIdx.push(idx);
    idx += lines[i].length + 1; // +1 for \n (we'll normalize later)
  }
}

// We normalize to \n internally for indices
const normCss = lines.join("\n");

// Find blocks by scanning lines and counting braces.
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // detect selector line at top level only
  // examples: ".aura-btn {", "  .aura-btn{", ".gate-primary {"
  const m = line.match(/^\s*\.(aura|gate)-[a-z0-9_-]+(?:__[a-z0-9_-]+)?(?:--[a-z0-9_-]+)?\s*\{/i);

  if (depth === 0 && m) {
    // start of a block
    const startLine = i;
    const startIdx = lineStartIdx[i] + line.indexOf("{"); // at "{"

    // now find matching closing brace for this block (depth from this "{")
    let localDepth = 0;
    let endLine = i;
    let endIdx = -1;

    // walk forward character-by-character from this line
    const startChar = lineStartIdx[i]; // beginning of line i
    let j = startChar;

    // set j to the first "{" on this line
    j = lineStartIdx[i] + line.indexOf("{");

    for (; j < normCss.length; j++) {
      const ch = normCss[j];
      if (ch === "{") localDepth++;
      else if (ch === "}") {
        localDepth--;
        if (localDepth === 0) {
          endIdx = j; // index of matching "}"
          // compute endLine
          // find greatest line k where lineStartIdx[k] <= endIdx
          let lo = 0, hi = lineStartIdx.length - 1, best = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lineStartIdx[mid] <= endIdx) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
          }
          endLine = best;
          break;
        }
      }
    }

    if (endIdx === -1) {
      throw new Error(`Unclosed block starting at line ${startLine + 1}`);
    }

    // selector name: take token up to "{"
    const selector = line.trim().split("{")[0].trim();

    if (!blocksBySel.has(selector)) blocksBySel.set(selector, []);
    blocksBySel.get(selector).push({
      selector,
      startLine: startLine + 1,
      endLine: endLine + 1,
      startIdx: lineStartIdx[startLine],
      endIdx: (endLine < lines.length - 1) ? lineStartIdx[endLine + 1] : normCss.length, // include trailing newline after end line
    });

    // continue; depth tracking handled below
  }

  // update global depth for this line (rough but fine for top-level detection)
  for (const ch of line) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
  }
}

// Determine duplicates (keep last occurrence)
const removals = [];
const reportLines = [];

for (const [selector, arr] of blocksBySel.entries()) {
  if (arr.length > 1) {
    reportLines.push(`DUPLICATE: ${selector}`);
    arr.forEach((b, idx) => {
      reportLines.push(`  [${idx + 1}/${arr.length}] lines ${b.startLine}-${b.endLine}`);
    });
    // remove all but last
    for (let k = 0; k < arr.length - 1; k++) removals.push(arr[k]);
    reportLines.push(`  KEEP: lines ${arr[arr.length - 1].startLine}-${arr[arr.length - 1].endLine}`);
    reportLines.push("");
  }
}

// Apply removals from bottom to top (so indices stay valid)
removals.sort((a, b) => b.startIdx - a.startIdx);

let out = normCss;
for (const r of removals) {
  out = out.slice(0, r.startIdx) + out.slice(r.endIdx);
}

fs.writeFileSync(outPath, out, "utf8");
fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");

console.log(`Wrote: ${outPath}`);
console.log(`Report: ${reportPath}`);
console.log(`Removed ${removals.length} duplicate blocks (kept last occurrence).`);
