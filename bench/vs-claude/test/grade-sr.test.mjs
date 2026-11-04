// SR-13/16/17/18 (S5): bộ chấm. Không gọi LLM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonJson, eq, gradeExact } from '../lib/grade.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `ccvb-${p}-`));
const put = (dir, rel, content) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content)); };

test('SR-16: so JSON không phụ thuộc thứ tự khóa, vẫn phụ thuộc thứ tự mảng', () => {
  assert.equal(eq({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }), true);
  assert.equal(eq([1, 2], [2, 1]), false);
  assert.equal(eq({ a: 1 }, { a: 2 }), false);
  assert.deepEqual(Object.keys(canonJson({ z: 1, a: { y: 1, b: 2 } })), ['a', 'z']);
});

test('SR-16: gradeExact đúng khi schedule viết khác thứ tự khóa', () => {
  const hidden = tmp('h'), work = tmp('w');
  put(hidden, 'answer.json', { schedule: { Mon: 'Dung', Tue: 'Chi' }, startup_order: ['a', 'b'], n: 10 });
  put(work, 'answer.json', { n: 10, startup_order: ['a', 'b'], schedule: { Tue: 'Chi', Mon: 'Dung' } });
  const g = gradeExact({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'answer.json' } });
  assert.equal(g.score, 1);
  put(work, 'answer.json', { n: 10, startup_order: ['b', 'a'], schedule: { Tue: 'Chi', Mon: 'Dung' } });
  assert.equal(gradeExact({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'answer.json' } }).details.fields.startup_order, false);
});

// ---- SR-17
import { gradeSecurity } from '../lib/grade.mjs';
const SUITE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const s1 = (findings) => {
  const work = tmp('s1');
  put(work, 'findings.json', findings);
  return gradeSecurity({ workdir: work, hiddenDir: path.join(SUITE, 'tasks/s1-sec-review/hidden'), suiteRepoDir: path.join(SUITE, 'tasks/s1-sec-review/repo'), finalText: '', task: { deliverable: 'findings.json' } });
};
const ref = JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks/s1-sec-review/hidden/reference/findings.json'), 'utf8'));

test('SR-17: oracle = 1,00; decoyHits = bonusHits = 0', () => {
  const g = s1(ref);
  assert.equal(g.score, 1); assert.equal(g.pass, true); assert.equal(g.details.decoyHits, 0); assert.equal(g.details.bonusHits, 0);
});

test('SR-17: finding thật ngoài danh sách (IDOR server.js:47) không là FP, báo riêng bonusHits', () => {
  const g = s1([...ref, { line: 47, type: 'missing-authz', severity: 'medium', fix: 'x' }]);
  assert.equal(g.details.fp, 0); assert.equal(g.details.bonusHits, 1); assert.equal(g.score, 1); assert.equal(g.pass, true);
});

test('SR-17: trúng decoy không là FP và không đổi điểm chính; decoyHits đếm riêng', () => {
  const g = s1([...ref, { line: 36, type: 'sqli', severity: 'high', fix: 'x' }, { line: 79, type: 'command-injection', severity: 'high', fix: 'x' }]);
  assert.equal(g.details.decoyHits, 2); assert.equal(g.details.fp, 0); assert.equal(g.score, 1);
});

test('SR-17: finding xa mọi dòng đã biết vẫn là FP', () => {
  const g = s1([...ref, { line: 24, type: 'other', severity: 'low', fix: 'x' }]);
  assert.equal(g.details.fp, 1); assert.ok(g.score < 1);
});

// ---- SR-18
import { gradeResearch, parseF1, countWords, citationValidityOf } from '../lib/grade.mjs';
const RE1 = path.join(SUITE, 'tasks/re1-lit-synthesis/hidden');
const re1 = (answer, review) => {
  const work = tmp('re1');
  put(work, 'answer.json', answer);
  if (review !== undefined) put(work, 'REVIEW.md', review);
  return gradeResearch({ workdir: work, hiddenDir: RE1, finalText: '', task: { deliverable: 'answer.json' } });
};
const refAns = JSON.parse(fs.readFileSync(path.join(RE1, 'answer.json'), 'utf8'));
const refReview = fs.readFileSync(path.join(RE1, 'reference/REVIEW.md'), 'utf8');

test('SR-18: oracle re1 = 1,00 với REVIEW tham chiếu 300–500 từ', () => {
  const g = re1(refAns, refReview);
  assert.equal(g.score, 1); assert.ok(g.details.reviewWords >= 300 && g.details.reviewWords <= 500);
});

test('SR-18: details ghi citationValidity; citationPrecision chỉ còn là alias đọc dữ liệu cũ', () => {
  const g = re1({ ...refAns, q1: { ...refAns.q1, citations: ['P4', 'P9'] } }, refReview);
  assert.equal('citationPrecision' in g.details, false);
  assert.ok(g.details.citationValidity < 1);
  assert.equal(citationValidityOf({ citationPrecision: 0.5 }), 0.5);
  assert.equal(citationValidityOf({ citationValidity: 0.7, citationPrecision: 0.5 }), 0.7);
});

test('SR-18: F1 dạng phần trăm được chấp nhận; giá trị sai vẫn trượt', () => {
  for (const v of [0.962, 96.2, '96.2%', '0.962', ' 96.2 % '.trim()]) assert.equal(re1({ ...refAns, q1: { ...refAns.q1, f1: v } }, refReview).details.checks.q1, true, String(v));
  for (const v of [0.931, '93.1%', 'abc', null, undefined, '']) assert.equal(re1({ ...refAns, q1: { ...refAns.q1, f1: v } }, refReview).details.checks.q1, false, String(v));
  assert.ok(Number.isNaN(parseF1('x')));
});

test('SR-18: REVIEW ngoài 300–500 từ không đạt review_written', () => {
  assert.equal(re1(refAns, 'Too short [P1] [P2] [P3].').details.checks.review_written, false);
  assert.equal(re1(refAns, `${refReview}\n${'word '.repeat(200)}`).details.checks.review_written, false);
  assert.equal(countWords('a  b\nc'), 3);
});
