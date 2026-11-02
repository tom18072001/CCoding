// Graders. Every grader returns { score: 0..1, pass: bool, details: {...}, formatMiss?: bool }.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judgeChecklist } from './judge.mjs';

/** Read a JSON deliverable; fall back to the last ```json block in the final report (format miss). */
export function readJsonDeliverable(workdir, file, finalText = '') {
  const p = path.join(workdir, file);
  if (fs.existsSync(p)) {
    try { return { value: JSON.parse(fs.readFileSync(p, 'utf8')), formatMiss: false }; } catch { /* fall through */ }
  }
  const blocks = [...String(finalText).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const b of blocks.reverse()) { try { return { value: JSON.parse(b), formatMiss: true }; } catch { /* next */ } }
  return { value: undefined, formatMiss: true };
}

/** Read a text deliverable; fall back to the final report text. */
export function readTextDeliverable(workdir, file, finalText = '') {
  const p = path.join(workdir, file);
  if (fs.existsSync(p)) return { text: fs.readFileSync(p, 'utf8'), formatMiss: false };
  return { text: String(finalText ?? ''), formatMiss: true };
}

/** Coding: copy workdir to a scratch dir, drop hidden tests in, run node:test, score = passed / total hidden tests. */
export function gradeCode({ workdir, hiddenDir }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-grade-'));
  fs.cpSync(workdir, tmp, { recursive: true, filter: (s) => !s.includes(`${path.sep}.git`) && !s.includes(`${path.sep}node_modules`) });
  fs.mkdirSync(path.join(tmp, 'hidden'), { recursive: true });
  // Copy every top-level file (tests plus helpers such as _helpers.js, _gen.js, oracle.js) but run only *.test.js.
  const files = fs.readdirSync(hiddenDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  for (const f of files) fs.copyFileSync(path.join(hiddenDir, f), path.join(tmp, 'hidden', f));
  const tests = files.filter((f) => f.endsWith('.test.js'));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests.map((f) => `hidden/${f}`)], { cwd: tmp, encoding: 'utf8', timeout: 120000, env: { ...process.env, NODE_TEST_CONTEXT: undefined } }); // NODE_TEST_CONTEXT: do not inherit when run under `node --test`
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (k) => Number(out.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? 0);
  const pass = num('pass'), fail = num('fail') + num('cancelled');
  const failed = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]).filter((n) => !n.startsWith('hidden/'));
  fs.rmSync(tmp, { recursive: true, force: true });
  const total = pass + fail;
  return { score: total ? pass / total : 0, pass: total > 0 && fail === 0, details: { passed: pass, total, failed } };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortU = (a) => [...new Set((a ?? []).map(String))].sort();

/** Logic: exact match per field; score = matched fields / fields. */
export function gradeExact({ workdir, hiddenDir, finalText, task }) {
  const want = JSON.parse(fs.readFileSync(path.join(hiddenDir, 'answer.json'), 'utf8'));
  const { value: got, formatMiss } = readJsonDeliverable(workdir, task.deliverable, finalText);
  const fields = {};
  for (const k of Object.keys(want)) {
    let g = got?.[k], w = want[k];
    if (Array.isArray(w) && k !== 'startup_order') { g = sortU(g); w = sortU(w); }
    fields[k] = eq(g, w);
  }
  const n = Object.values(fields).filter(Boolean).length;
  return { score: n / Object.keys(fields).length, pass: n === Object.keys(fields).length, details: { fields }, formatMiss };
}

/** Security review: recall over seeded issues, precision over reported findings (findings near a seeded line with another type are neutral). */
export function gradeSecurity({ workdir, hiddenDir, finalText, task, suiteRepoDir }) {
  const spec = JSON.parse(fs.readFileSync(path.join(hiddenDir, 'issues.json'), 'utf8'));
  const src = fs.readFileSync(path.join(suiteRepoDir, 'src/server.js'), 'utf8').split('\n');
  const lineOf = (a) => src.findIndex((l) => l.includes(a)) + 1;
  const issues = spec.issues.map((i) => ({ ...i, line: lineOf(i.anchor) }));
  const decoys = spec.decoys.map((d) => ({ ...d, line: lineOf(d.anchor) }));
  const { value, formatMiss } = readJsonDeliverable(workdir, task.deliverable, finalText);
  const findings = Array.isArray(value) ? value : Array.isArray(value?.findings) ? value.findings : [];
  const near = (f, l) => Math.abs(Number(f.line) - l) <= 3;
  const found = new Set(); let tp = 0, fp = 0, neutral = 0, decoyHits = 0;
  for (const f of findings) {
    const hit = issues.find((i) => near(f, i.line) && String(f.type).toLowerCase() === i.type && !found.has(i.type));
    if (hit) { found.add(hit.type); tp++; continue; }
    if (decoys.some((d) => near(f, d.line)) && !issues.some((i) => near(f, i.line))) { decoyHits++; fp++; continue; }
    if (issues.some((i) => near(f, i.line))) { neutral++; continue; }
    fp++;
  }
  const recall = found.size / issues.length;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
  return { score: f1, pass: recall === 1 && fp === 0, details: { recall, precision, tp, fp, neutral, decoyHits, missed: issues.filter((i) => !found.has(i.type)).map((i) => i.type) }, formatMiss };
}

/** Checklist (requirements/design): LLM judge per item when enabled, regex fallback otherwise. */
export async function gradeChecklist({ workdir, hiddenDir, finalText, task, judge }) {
  const { items } = JSON.parse(fs.readFileSync(path.join(hiddenDir, 'checklist.json'), 'utf8'));
  const { text, formatMiss } = readTextDeliverable(workdir, task.deliverable, finalText);
  let verdicts;
  if (judge?.enabled) verdicts = await judgeChecklist(text, items, judge);
  else verdicts = Object.fromEntries(items.map((it) => [it.id, it.regex.some((re) => new RegExp(re, 'is').test(text))]));
  const n = Object.values(verdicts).filter(Boolean).length;
  return { score: n / items.length, pass: n === items.length, details: { verdicts, judge: judge?.enabled ? judge.model : 'regex', chars: text.length }, formatMiss };
}

/** Research: answer correctness + citation validity + correct refusal. */
export function gradeResearch({ workdir, hiddenDir, finalText, task }) {
  const want = JSON.parse(fs.readFileSync(path.join(hiddenDir, 'answer.json'), 'utf8'));
  const { value: g = {}, formatMiss } = readJsonDeliverable(workdir, task.deliverable, finalText);
  const valid = new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  const allCites = ['q1', 'q2', 'q3', 'q4'].flatMap((q) => g?.[q]?.citations ?? []).map(String);
  const checks = {
    q1: g.q1?.paper === 'P4' && Math.abs(Number(g.q1?.f1) - 0.962) < 1e-6,
    q1_cites: (g.q1?.citations ?? []).includes('P4'),
    q2: g.q2?.paper === 'P5' && /BGL-?X/i.test(String(g.q2?.dataset)),
    q3_refusal: g.q3?.not_in_corpus === true,
    q4: eq(sortU(g.q4?.papers), ['P1', 'P3']),
    no_fabricated_citations: allCites.length > 0 && allCites.every((c) => valid.has(c)),
  };
  const review = readTextDeliverable(workdir, 'REVIEW.md', '');
  const reviewCites = [...review.text.matchAll(/\[(P\d+)\]/g)].map((m) => m[1]);
  checks.review_written = !review.formatMiss && reviewCites.length >= 3 && reviewCites.every((c) => valid.has(c));
  const n = Object.values(checks).filter(Boolean).length;
  return {
    score: n / Object.keys(checks).length, pass: n === Object.keys(checks).length,
    details: { checks, citationPrecision: allCites.length ? allCites.filter((c) => valid.has(c)).length / allCites.length : 0, correctRefusal: checks.q3_refusal },
    formatMiss,
  };
}

export const GRADERS = { code: gradeCode, exact: gradeExact, security: gradeSecurity, checklist: gradeChecklist, research: gradeResearch };
