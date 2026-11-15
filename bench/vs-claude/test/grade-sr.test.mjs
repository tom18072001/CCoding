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

// ---- SR-13
import { gradeCode, deliverablesMissing, attributeFailures } from '../lib/grade.mjs';
/** Bài giả: starter (a.js, b.js trả sai), ref sửa cả hai; test ẩn: 2 test tên "a: …", 1 test "b: …". */
const mkTask = () => {
  const root = tmp('task');
  put(root, 'starter/package.json', { scripts: { test: 'node --test \"test/**/*.test.js\"' } });
  put(root, 'starter/src/a.js', 'export const a = () => 0;\n');
  put(root, 'starter/src/b.js', 'export const b = () => 0;\n');
  put(root, 'starter/test/ok.test.js', "import t from 'node:test'; t('ok', () => {});\n");
  put(root, 'ref/src/a.js', 'export const a = () => 1;\n');
  put(root, 'ref/src/b.js', 'export const b = () => 2;\n');
  put(root, 'hidden/x.hidden.test.js', "import t from 'node:test'; import assert from 'node:assert/strict'; import { a } from '../src/a.js'; import { b } from '../src/b.js';\nt('a: một', () => assert.equal(a(), 1));\nt('a: hai', () => assert.equal(a(), 1));\nt('b: một', () => assert.equal(b(), 2));\n");
  return { root, hiddenDir: path.join(root, 'hidden'), suiteRepoDir: path.join(root, 'starter'), task: { id: 'fake', deliverable: 'src/', solutionDir: 'ref' } };
};
const copyOf = (src) => { const d = tmp('copy'); fs.cpSync(src, d, { recursive: true }); return d; };

test('SR-13: thiếu tệp sản phẩm → formatMiss; đủ → không', () => {
  const w = tmp('fm'); put(w, 'bin/x.js', '1');
  assert.deepEqual(deliverablesMissing(w, 'src/, bin/x.js'), ['src/']);
  assert.deepEqual(deliverablesMissing(w, 'bin/x.js'), []);
  fs.mkdirSync(path.join(w, 'src')); // thư mục rỗng vẫn là thiếu
  assert.deepEqual(deliverablesMissing(w, 'src/'), ['src/']);
  const T = mkTask();
  const empty = tmp('empty');
  assert.equal(gradeCode({ workdir: empty, ...T, visibleCheck: false }).formatMiss, true);
  assert.equal(gradeCode({ workdir: copyOf(path.join(T.root, 'ref')), ...T, visibleCheck: false }).formatMiss, false);
});

test('SR-13: untouchedFileFailures chỉ đếm test trượt thuộc tệp agent không sửa', () => {
  const T = mkTask();
  const w = copyOf(T.suiteRepoDir); // agent chỉ sửa b.js
  fs.copyFileSync(path.join(T.root, 'ref/src/b.js'), path.join(w, 'src/b.js'));
  const g = gradeCode({ workdir: w, ...T, visibleCheck: false });
  assert.deepEqual(g.details.failed, ['a: một', 'a: hai']);
  assert.equal(g.details.untouchedFileFailures, 2);
  assert.deepEqual(g.details.untouchedFiles, ['src/a.js']);
  // agent sửa a.js nhưng sửa sai: trượt nhưng KHÔNG thuộc tệp không sửa
  fs.writeFileSync(path.join(w, 'src/a.js'), 'export const a = () => 5;\n');
  assert.equal(gradeCode({ workdir: w, ...T, visibleCheck: false }).details.untouchedFileFailures, 0);
  // lời giải tham chiếu đúng: 0 trượt, 0 untouched
  const ok = gradeCode({ workdir: copyOf(path.join(T.root, 'ref')), ...T, visibleCheck: false });
  assert.equal(ok.score, 1); assert.equal(ok.details.untouchedFileFailures, 0);
});

test('SR-13: agent không sửa tệp nào cần đổi → mọi test trượt thuộc tệp không sửa (không cần bản đồ tên test)', () => {
  const T = mkTask();
  const hf = path.join(T.hiddenDir, 'x.hidden.test.js'); // tên test không chứa tên tệp nguồn
  fs.writeFileSync(hf, fs.readFileSync(hf, 'utf8').replace(/'a: một'/, "'tc1'").replace(/'a: hai'/, "'tc2'").replace(/'b: một'/, "'tc3'"));
  const g = gradeCode({ workdir: copyOf(T.suiteRepoDir), ...T, visibleCheck: false });
  assert.deepEqual(g.details.failed, ['tc1', 'tc2', 'tc3']);
  assert.equal(g.details.failed.length, 3);
  assert.equal(g.details.untouchedFileFailures, 3);
  assert.deepEqual(g.details.untouchedFiles, ['src/a.js', 'src/b.js']);
});

test('SR-13: filemap.json gán test theo tên không chứa tên tệp', () => {
  assert.equal(attributeFailures(['truy vấn: x', 'CLI: y', 'parse: z'], ['src/query.js', 'bin/logq.js'], { '^truy vấn': 'src/query.js', '^CLI': 'bin/logq.js' }), 2);
  assert.equal(attributeFailures(['parse: z', 'CLI: y'], ['src/parse.js'], {}), 1);
});

test('SR-13: redAtEnd khi lệnh kiểm của agent còn đỏ lúc kết thúc', () => {
  const T = mkTask();
  const green = copyOf(path.join(T.root, 'ref')); put(green, 'package.json', { type: 'module', scripts: { test: 'node --test \"test/**/*.test.js\"' } }); put(green, 'test/ok.test.js', "import t from 'node:test'; t('ok', () => {});\n");
  assert.equal(gradeCode({ workdir: green, ...T }).details.redAtEnd, false);
  const red = copyOf(green); put(red, 'test/bad.test.js', "import t from 'node:test'; import assert from 'node:assert/strict'; t('bad', () => assert.equal(1, 2));\n");
  assert.equal(gradeCode({ workdir: red, ...T }).details.redAtEnd, true);
});

test('SR-13: ca t5 (starter chưa làm gì, như C9 ccoding-fastlane.2): trượt toàn bộ, untouched > 0', { timeout: 600000 }, () => {
  const t5 = path.join(SUITE, 'tasks/t5-logq');
  const task = JSON.parse(fs.readFileSync(path.join(t5, 'task.json'), 'utf8'));
  const g = gradeCode({ workdir: copyOf(path.join(t5, 'starter')), hiddenDir: path.join(t5, 'hidden'), suiteRepoDir: path.join(t5, 'starter'), task, visibleCheck: false });
  assert.ok(g.details.failed.length > 0);
  assert.equal(g.details.untouchedFileFailures, g.details.failed.length);
  assert.ok(g.details.untouchedFiles.includes('src/parse.js'));
});
