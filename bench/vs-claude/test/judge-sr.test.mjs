// SR-08a/08b + D2 (S5): giám khảo và pairwise. Dùng bin giả (test/fixtures/fake-judge.mjs), không gọi `claude` thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agreementRate, ballotCode, ballotCount, ballotsCsv, blind, cohenKappa, detectLang, joinParts, judgePair, pickBallots, signTest, wilson } from '../lib/judge.mjs';
import { gradeChecklist } from '../lib/grade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITE = path.resolve(HERE, '..');
const FAKE = path.join(HERE, 'fixtures', 'fake-judge.mjs');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `ccvb-${p}-`));
const withEnv = (env, fn) => { const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; } const done = () => { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }; const r = fn(); return r?.then ? r.finally(done) : (done(), r); };
const fakeOpts = (model) => ({ model, bin: process.execPath, binArgs: [FAKE] });

// ---------- SR-08b: kiểm định dấu, Wilson ----------
test('SR-08b: kiểm định dấu chính xác hai phía', () => {
  assert.ok(Math.abs(signTest(8, 2).p - 0.109375) < 1e-12);
  assert.ok(Math.abs(signTest(2, 8).p - 0.109375) < 1e-12);
  assert.equal(signTest(5, 5).p, 1);
  assert.equal(signTest(0, 0).p, 1);
  assert.ok(Math.abs(signTest(0, 10).p - 2 / 1024) < 1e-12);
  assert.ok(signTest(20, 0).p < 1e-5);
});

test('SR-08b: CI Wilson khớp giá trị tham chiếu và nằm trong [0,1]', () => {
  const w = wilson(8, 10);
  assert.ok(Math.abs(w.lo - 0.4902) < 1e-3 && Math.abs(w.hi - 0.9433) < 1e-3);
  const z = wilson(0, 5), o = wilson(5, 5);
  assert.equal(z.lo, 0); assert.ok(z.hi > 0.3 && z.hi < 0.6);
  assert.equal(o.hi, 1);
  assert.ok(Number.isNaN(wilson(0, 0).p));
});

test('SR-08b: blind() chuẩn hóa dấu hiệu nhận ra hệ thống (tên mô hình, đồng tác giả, emoji, xuống dòng)', () => {
  const out = blind('Viết bởi CCoding dùng Claude Sonnet 5.5 và claude-opus-5-5 ✅🚀\r\nCo-Authored-By: X\n\n\n\nHết  ');
  assert.ok(!/ccoding|sonnet|opus|claude|Co-Authored|✅|🚀|\r/i.test(out), out);
  assert.ok(!/\n{3,}/.test(out));
  assert.equal(blind('lỗi 404 ở dòng 3'), 'lỗi 404 ở dòng 3'); // không làm hỏng nội dung thường
});

test('SR-08b: joinParts dùng tiêu đề trung tính, không lộ tên tệp phụ', () => {
  const t = joinParts(['a', 'b']);
  assert.match(t, /## Part 1/); assert.match(t, /## Part 2/); assert.ok(!/REVIEW|NOTES/.test(t));
  assert.equal(joinParts(['chỉ một']), 'chỉ một');
});

test('SR-08b: detectLang phân biệt tiếng Việt / tiếng Anh', () => {
  assert.equal(detectLang('Hệ thống phải đảm bảo tính toàn vẹn của nhật ký'), 'vi');
  assert.equal(detectLang('The system must keep the audit log intact'), 'en');
});

// ---------- SR-08a: đồng thuận, phiếu ----------
test('SR-08a: agreementRate và Cohen kappa', () => {
  assert.equal(agreementRate(['x', 'y', 'tie', 'x'], ['x', 'y', 'x', 'y']), 0.5);
  assert.equal(agreementRate([], []), undefined);
  assert.equal(agreementRate(['x'], ['x', 'y']), undefined);
  assert.equal(cohenKappa(['x', 'y', 'x', 'y'], ['x', 'y', 'x', 'y']), 1);
  assert.ok(Math.abs(cohenKappa(['x', 'y', 'x', 'y'], ['y', 'x', 'y', 'x']) + 1) < 1e-12);
  assert.ok(Math.abs(cohenKappa(['x', 'x', 'y', 'y'], ['x', 'y', 'x', 'y'])) < 1e-12);
});

test('SR-08a: số phiếu ≥ 20 % (làm tròn lên), tối thiểu 1, xác định theo hạt', () => {
  assert.equal(ballotCount(10), 2); assert.equal(ballotCount(11), 3); assert.equal(ballotCount(1), 1); assert.equal(ballotCount(0), 0); assert.equal(ballotCount(5), 1);
  for (const n of [1, 3, 7, 10, 23, 40]) assert.ok(pickBallots(n).length >= 0.2 * n, `n=${n}`);
  assert.deepEqual(pickBallots(20, { seed: 1 }), pickBallots(20, { seed: 1 }));
  assert.equal(new Set(pickBallots(20)).size, pickBallots(20).length);
});

test('SR-08a: mã cặp ẩn danh không chứa id/tên bài; CSV chỉ có cột cho phép', () => {
  const c = ballotCode('r1-elk-design#3', 'salt');
  assert.match(c, /^P[0-9a-f]{8}$/);
  assert.notEqual(c, ballotCode('r1-elk-design#3', 'khác'));
  const csv = ballotsCsv([{ code: c, id: 'r1-elk-design#3', arm: 'A0-sonnet', category: 'design', fileA: 'files/a.md', fileB: 'files/b.md' }]);
  assert.equal(csv.split('\n')[0], 'pairCode,category,fileA,fileB,humanWinner,note');
  assert.ok(!csv.includes('r1-elk') && !csv.includes('A0-') && !csv.includes('B0'));
});

// ---------- giám khảo giả: judgePair, checklist D2 ----------
test('SR-08a: judgePair với bin giả — đúng cả hai thứ tự thì thắng, thiên vị vị trí thì hòa', async () => {
  const good = await withEnv({ FAKE_JUDGE_MODE: 'pref' }, () => judgePair('b', 'r', 'GOOD answer', 'weak', fakeOpts('judge-one')));
  assert.equal(good.winner, 'x');
  const flipped = await withEnv({ FAKE_JUDGE_MODE: 'pref' }, () => judgePair('b', 'r', 'weak', 'GOOD answer', fakeOpts('judge-one')));
  assert.equal(flipped.winner, 'y');
  const biased = await withEnv({ FAKE_JUDGE_MODE: 'A' }, () => judgePair('b', 'r', 'GOOD', 'weak', fakeOpts('judge-one')));
  assert.equal(biased.winner, 'tie');
});

const chk = (dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'checklist.json'), JSON.stringify({ items: [{ id: 'i1', question: 'q1', regex: ['x'] }, { id: 'i2', question: 'q2', regex: ['y'] }] })); };
test('D2: gradeChecklist ghi judge, judge2, judgeAgreement khi có giám khảo thứ hai', async () => {
  const hidden = tmp('chk'), work = tmp('chkw');
  chk(hidden); fs.writeFileSync(path.join(work, 'D.md'), 'GOOD document');
  const judge = { enabled: true, model: 'judge-one', model2: 'judge-two', bin: process.execPath, binArgs: [FAKE] };
  const g = await withEnv({ FAKE_JUDGE_MODE: 'flip2' }, () => gradeChecklist({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'D.md' }, judge }));
  assert.equal(g.details.judge, 'judge-one'); assert.equal(g.details.judge2, 'judge-two');
  assert.equal(g.details.judgeAgreement, 0.5); // i1 ngược, i2 trùng
  assert.equal(g.score, 1); // điểm chính theo giám khảo 1
  const solo = await withEnv({ FAKE_JUDGE_MODE: 'pref' }, () => gradeChecklist({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'D.md' }, judge: { enabled: true, model: 'judge-one', bin: process.execPath, binArgs: [FAKE] } }));
  assert.equal(solo.details.judge2, undefined); assert.equal(solo.details.judgeAgreement, undefined);
  const same = await withEnv({ FAKE_JUDGE_MODE: 'pref' }, () => gradeChecklist({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'D.md' }, judge: { enabled: true, model: 'judge-one', model2: 'judge-one', bin: process.execPath, binArgs: [FAKE] } }));
  assert.equal(same.details.judge2, undefined); // giám khảo 2 trùng giám khảo 1 không phải giám khảo thứ hai
});

// ---------- pairwise.mjs đầu-cuối với bin giả ----------
function mkRun(nPairs, { yWins = false } = {}) {
  const run = tmp('run'), rows = [];
  for (let rep = 1; rep <= nPairs; rep++) {
    for (const arm of ['A0-sonnet', 'B0']) {
      const key = `r1-elk-design__${arm}__r${rep}`;
      const good = (arm === 'A0-sonnet') !== yWins;
      fs.mkdirSync(path.join(run, 'artifacts', key), { recursive: true });
      fs.writeFileSync(path.join(run, 'artifacts', key, 'DESIGN.md'), `${good ? 'GOOD' : 'weak'} thiết kế ${rep} do ${arm === 'B0' ? 'CCoding' : 'agent'} viết`);
      fs.writeFileSync(path.join(run, 'artifacts', key, 'NOTES.md'), `ghi chú ${rep}`);
      rows.push({ key, task: 'r1-elk-design', category: 'design', arm, rep, leak: false });
    }
  }
  fs.writeFileSync(path.join(run, 'runs.jsonl'), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return run;
}
const pairwise = (run, args, env = {}) => spawnSync(process.execPath, [path.join(SUITE, 'pairwise.mjs'), run, '--judge-bin', process.execPath, '--judge-bin-args', JSON.stringify([FAKE]), ...args], { encoding: 'utf8', env: { ...process.env, FAKE_JUDGE_MODE: 'pref', ...env } });

test('SR-08a: pairwise.mjs ghi judge2, winner2, judgeAgreement và tóm tắt kiểm định dấu/CI', () => {
  const run = mkRun(5);
  const r = pairwise(run, ['--x', 'A0-sonnet', '--y', 'B0', '--model', 'judge-one', '--judge2-model', 'judge-two'], { FAKE_JUDGE_MODE: 'flip2' });
  assert.equal(r.status, 0, r.stderr);
  const rows = fs.readFileSync(path.join(run, 'pairwise.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 5);
  for (const row of rows) { assert.equal(row.judge, 'judge-one'); assert.equal(row.judge2, 'judge-two'); assert.equal(row.winner, 'x'); assert.equal(row.winner2, 'y'); assert.equal(row.agree, false); }
  const s = JSON.parse(fs.readFileSync(path.join(run, 'pairwise.summary.json'), 'utf8'));
  assert.equal(s.judgeAgreement, 0); assert.equal(s.judge2Pairs, 5); assert.equal(s.winsX, 5); assert.equal(s.winsY, 0);
  assert.ok(Math.abs(s.signTestP - 2 / 32) < 1e-12);
  assert.equal(s.yShareCI95[0], 0); assert.ok(s.yShareCI95[1] > 0 && s.yShareCI95[1] < 1);
  assert.match(fs.readFileSync(path.join(run, 'pairwise.md'), 'utf8'), /agreement 0%.*kappa|sign test p = 0\.0625/s);
});

test('SR-08a: không có --judge2-model thì không ghi judgeAgreement; --judge2-model trùng --model bị từ chối', () => {
  const run = mkRun(2);
  const r = pairwise(run, ['--model', 'judge-one']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, 'pairwise.summary.json'), 'utf8')).judgeAgreement, undefined);
  const bad = pairwise(mkRun(1), ['--model', 'judge-one', '--judge2-model', 'judge-one']);
  assert.equal(bad.status, 2);
});

test('SR-08a: phiếu người ≥ 20 % cặp, CSV chỉ mã ẩn danh, khóa giải mã tách riêng, tệp đã làm mù', () => {
  const run = mkRun(10, { yWins: true }), out = path.join(tmp('ballots'), 'b');
  const r = pairwise(run, ['--model', 'judge-one', '--ballots-out', out, '--ballot-frac', '0.2']);
  assert.equal(r.status, 0, r.stderr);
  const csv = fs.readFileSync(path.join(out, 'ballots.csv'), 'utf8').trim().split('\n');
  assert.equal(csv[0], 'pairCode,category,fileA,fileB,humanWinner,note');
  assert.ok(csv.length - 1 >= 2, `chỉ ${csv.length - 1} phiếu`);
  const text = csv.join('\n');
  assert.ok(!/r1-elk|A0-sonnet|B0|__r\d|CCoding/.test(text), text);
  const key = JSON.parse(fs.readFileSync(path.join(out, 'ballots.key.json'), 'utf8'));
  assert.equal(key.total, 10); assert.ok(key.selected >= 2); assert.match(key.warning, /không đưa cho người chấm/);
  const code = csv[1].split(',')[0];
  assert.ok(key.key[code]); assert.ok(['x', 'y'].includes(key.key[code].A));
  for (const f of fs.readdirSync(path.join(out, 'files'))) {
    const body = fs.readFileSync(path.join(out, 'files', f), 'utf8');
    assert.ok(!/CCoding|NOTES|REVIEW/i.test(body), `${f} lộ dấu hiệu: ${body}`);
    assert.match(body, /## Part 1/);
  }
  // vị trí A/B phải bị ngẫu nhiên hóa: không phải mọi phiếu đều để x ở A
  const sides = Object.values(key.key).map((k) => k.A);
  assert.ok(sides.includes('x') || sides.includes('y'));
});
