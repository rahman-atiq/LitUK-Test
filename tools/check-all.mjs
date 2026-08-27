#!/usr/bin/env node
/**
 * Every check this repo has, in one command.
 *
 *   npm test              all four, summarised
 *   npm test -- --quiet   only the failures and the summary
 *
 * This file exists because of what happened without it. The four checks below
 * were each written carefully, each guards something the sprint cannot afford to
 * lose, and by 27 August three of them had been failing for weeks — not because
 * anyone ignored a red result, but because running them was four things to
 * remember instead of one, so nobody ran them and nothing was red on any screen.
 *
 * So: it runs ALL of them and reports at the end, rather than stopping at the
 * first failure. A run that stops early tells you the banks are broken and
 * leaves you believing the backup still works. Finding out about both in one
 * run is the entire point.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes("--quiet");

/* Ordered by how much it costs to be wrong about, cheapest first. A duplicate
   question id silently reattaches your mistake history to the wrong question;
   a broken export loses the lot. */
const CHECKS = [
  ["validate-banks.mjs", "the question banks and everything derived from them"],
  ["test-verify-bank.mjs", "the answers that disagree with the handbook chapters"],
  ["test-backup.mjs", "export and restore — your progress surviving a lost phone"],
  ["test-cast-quiz.mjs", "the cast quiz"],
];

const results = [];
for (const [file, what] of CHECKS) {
  if (!quiet) console.log(`\n\x1b[1m── ${file}\x1b[0m  ${what}`);
  const r = spawnSync(process.execPath, [path.join(here, file)], {
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  const passed = r.status === 0;
  results.push({ file, what, passed });
  if (quiet && !passed) {
    console.log(`\n\x1b[1m── ${file}\x1b[0m  ${what}`);
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
  }
}

const failed = results.filter((r) => !r.passed);
console.log("\n" + "─".repeat(64));
for (const r of results) {
  console.log(`  ${r.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${r.file.padEnd(24)} ${r.what}`);
}
if (failed.length) {
  console.log(`\n\x1b[31m${failed.length} of ${results.length} checks failed.\x1b[0m Do not deploy on this.`);
  process.exit(1);
}
console.log(`\n\x1b[32mAll ${results.length} checks pass.\x1b[0m`);
