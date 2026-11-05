// SR-11: ba bài khám phá a2/re2/s2 — oracle 1,00, null thấp, task.json đúng D6, grader có chiều phân biệt thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRADERS, gradeResearch } from '../lib/grade.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEW = ['a2-oncall-sms', 're2-stream-synthesis', 's2-support-review'];
const dirOf = (id) => path.join(ROOT, 'tasks', id);
const taskOf = (id) => JSON.parse(fs.readFileSync(path.join(dirOf(id), 'task.json'), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-sr11-'));
const grade = (id, work) => GRADERS[taskOf(id).grader]({ workdir: work, hiddenDir: path.join(dirOf(id), 'hidden'), suiteRepoDir: path.join(dirOf(id), 'repo'), finalText: '', task: taskOf(id), judge: { enabled: false } });
/** Dựng workspace oracle như run.mjs: repo + hidden/reference (+ answer.json). */
function oracleDir(id) {
  const dir = tmp(); const t = taskOf(id); const h = path.join(dirOf(id), 'hidden');
  fs.cpSync(path.join(dirOf(id), 'repo'), dir, { recursive: true });
  if (fs.existsSync(path.join(h, 'answer.json'))) fs.copyFileSync(path.join(h, 'answer.json'), path.join(dir, t.deliverable.endsWith('.json') ? t.deliverable : 'answer.json'));
  if (fs.existsSync(path.join(h, 'reference'))) fs.cpSync(path.join(h, 'reference'), dir, { recursive: true });
  return dir;
}

test('SR-11 / D6: ba bài có set exploratory, không nhãn H, size khớp sizeBasis', () => {
  for (const id of NEW) {
    const t = taskOf(id);
    assert.equal(t.id, id);
    assert.equal(t.set, 'exploratory');
    assert.deepEqual(t.hypotheses, []);
    assert.ok(Number.isInteger(t.size) && t.size >= 1);
    assert.equal(t.sizeBasis.replace(/^[a-z]+: /, '').split(/\s*[,;]\s*/).length, t.size, t.sizeBasis);
    assert.ok(t.brief.length > 200 && /[A-Za-z]/.test(t.brief));
  }
  assert.deepEqual(NEW.map((id) => taskOf(id).category), ['requirements', 'research', 'review']);
});

test('SR-11: oracle = 1,00 và null ≤ 0,25 trên cả ba bài', async () => {
  for (const id of NEW) {
    const o = await grade(id, oracleDir(id));
    assert.equal(o.score, 1, `${id}: ${JSON.stringify(o.details)}`);
    assert.equal(o.pass, true, id);
    const n = await grade(id, (() => { const d = tmp(); fs.cpSync(path.join(dirOf(id), 'repo'), d, { recursive: true }); return d; })());
    assert.ok(n.score <= 0.25, `${id}: null ${n.score}`);
  }
});

test('SR-11 a2: mỗi mục checklist bắt đúng một lỗi — bỏ đoạn tương ứng thì mục đó rớt, các mục khác giữ', async () => {
  const spec = fs.readFileSync(path.join(dirOf('a2-oncall-sms'), 'hidden', 'reference', 'SPEC.md'), 'utf8');
  const ids = ['pii-fullline', 'latency-batch', 'coverage-gap', 'escalation', 'trigger-definition', 'sms-cost-cap'];
  for (const [i, id] of ids.entries()) {
    const work = tmp();
    fs.writeFileSync(path.join(work, 'SPEC.md'), spec.split('\n').filter((l) => !l.startsWith(`${i + 1}. `)).join('\n'));
    const g = await grade('a2-oncall-sms', work);
    assert.equal(g.details.verdicts[id], false, `${id} phải rớt khi bỏ mục ${i + 1}`);
    assert.equal(Object.values(g.details.verdicts).filter(Boolean).length, 5, id);
  }
});

test('SR-11 a2: chép lại đề bài (không phát hiện mâu thuẫn nào) chỉ đạt 0', async () => {
  const work = tmp();
  fs.writeFileSync(path.join(work, 'SPEC.md'), `# Spec\n## Open questions and assumptions\n${taskOf('a2-oncall-sms').brief}\n`);
  const g = await grade('a2-oncall-sms', work);
  assert.equal(g.score, 0, JSON.stringify(g.details.verdicts));
});

test('SR-11 re2: rubric riêng — đáp án bẫy (SPR-Y-lite, P5) bị phạt; re1 không có rubric.json và vẫn chấm như cũ', async () => {
  const work = oracleDir('re2-stream-synthesis');
  const ans = JSON.parse(fs.readFileSync(path.join(work, 'answer.json'), 'utf8'));
  ans.q1 = { paper: 'P5', f1: 0.934, citations: ['P5'] };
  fs.writeFileSync(path.join(work, 'answer.json'), JSON.stringify(ans));
  const g = await grade('re2-stream-synthesis', work);
  assert.equal(g.details.checks.q1, false);
  assert.ok(Math.abs(g.score - 5 / 7) < 1e-9, String(g.score)); // q1 và q1_cites cùng rớt
  assert.equal(fs.existsSync(path.join(dirOf('re1-lit-synthesis'), 'hidden', 'rubric.json')), false);
  const r1 = await grade('re1-lit-synthesis', oracleDir('re1-lit-synthesis'));
  assert.equal(r1.score, 1);
  // answer.json của re1 không được chấm là đúng ở re2 (rubric khác nhau)
  const cross = tmp(); fs.copyFileSync(path.join(dirOf('re1-lit-synthesis'), 'hidden', 'answer.json'), path.join(cross, 'answer.json'));
  const c = await gradeResearch({ workdir: cross, hiddenDir: path.join(dirOf('re2-stream-synthesis'), 'hidden'), finalText: '', task: taskOf('re2-stream-synthesis') });
  assert.equal(c.details.checks.q1, false);
  assert.equal(c.details.checks.q4, false);
});

test('SR-11 re2: REVIEW.md tham chiếu dài 300–500 từ; corpus có đủ P1–P6', () => {
  const words = fs.readFileSync(path.join(dirOf('re2-stream-synthesis'), 'hidden', 'reference', 'REVIEW.md'), 'utf8').match(/\S+/g).length;
  assert.ok(words >= 300 && words <= 500, String(words));
  assert.deepEqual(fs.readdirSync(path.join(dirOf('re2-stream-synthesis'), 'repo', 'corpus')).sort(), ['P1.md', 'P2.md', 'P3.md', 'P4.md', 'P5.md', 'P6.md']);
});

test('SR-11 s2: 6 lỗi gieo + 3 decoy; báo decoy không phải FP, báo dòng vô hại là FP', async () => {
  const work = oracleDir('s2-support-review');
  const ref = JSON.parse(fs.readFileSync(path.join(work, 'findings.json'), 'utf8'));
  assert.equal(ref.length, 6);
  const src = fs.readFileSync(path.join(dirOf('s2-support-review'), 'repo', 'src', 'server.js'), 'utf8').split('\n');
  const decoyLine = src.findIndex((l) => l.includes('ORDER BY ${col}')) + 1;
  fs.writeFileSync(path.join(work, 'findings.json'), JSON.stringify([...ref, { line: decoyLine, type: 'sqli', severity: 'high', fix: 'x' }]));
  const d = await grade('s2-support-review', work);
  assert.equal(d.details.decoyHits, 1);
  assert.equal(d.details.fp, 0);
  assert.equal(d.score, 1);
  fs.writeFileSync(path.join(work, 'findings.json'), JSON.stringify([...ref, { line: 2, type: 'other', severity: 'low', fix: 'x' }]));
  const f = await grade('s2-support-review', work);
  assert.equal(f.details.fp, 1);
  assert.ok(f.score < 1);
});
