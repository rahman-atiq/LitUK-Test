/**
 * Loads the question-bank data files the way the browser does — by running
 * them against a stand-in window — so the build tools and the app can never
 * disagree about what is in the banks. No regex over markup, which is what
 * broke the search-index build the last time the data moved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const R = (f) => path.join(ROOT, f);

/** Data files, in the same order the page loads them. */
export const BANK_FILES = ["mock-data.js", "practice-data.js", "testprep-data.js", "lituktestweb-data.js", "toughest-data.js"];

/** Topic index. Order is load-bearing: q.p and S.topics[i] are keyed on it.
 *  Must match TOPICS in life-in-uk-mock-tests.html and TOPIC_NAMES in
 *  index.html — tools/validate-banks.mjs asserts all three agree. */
export const TOPICS = [
  "A modern, thriving society",
  "A long and illustrious history",
  "The UK government, the law and your role",
  "The Values and principles of the UK",
  "What is the UK?",
];

export function loadBanks() {
  const window = {};
  for (const f of BANK_FILES) {
    if (!fs.existsSync(R(f))) continue;
    new Function("window", fs.readFileSync(R(f), "utf8"))(window);
  }
  const banks = window.LITUK_BANKS || [];
  if (!banks.length) throw new Error(`no banks loaded — looked for ${BANK_FILES.join(", ")}`);
  return banks;
}

/** Every test across every bank, each tagged with the bank it came from. */
export const allTests = (banks) => banks.flatMap((b) => b.tests.map((t) => ({ ...t, bank: b })));

/** Every question, one per id. Last write wins, exactly as the engine's QByG
 *  does, so a question shared between tests reports the same _test in search
 *  results as it does in the app. */
export function allQuestions(banks) {
  const byG = new Map();
  for (const t of allTests(banks)) for (const q of t.q) byG.set(q.g, { ...q, _test: t.n });
  return [...byG.values()];
}
