// SR-16: l1-oncall được xác nhận bằng duyệt vét cạn; l3-reconcile ghi rõ định nghĩa "duplicate rows".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULES, solve, verify } from '../tasks/l1-oncall/hidden/bruteforce.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const L1 = path.join(ROOT, 'tasks', 'l1-oncall');
const L3 = path.join(ROOT, 'tasks', 'l3-reconcile');
const answer = JSON.parse(fs.readFileSync(path.join(L1, 'hidden', 'answer.json'), 'utf8'));

test('SR-16 l1: script brute-force exit 0 trên answer.json hiện hành', () => {
  const r = spawnSync(process.execPath, [path.join(L1, 'hidden', 'bruteforce.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('SR-16 l1: lời giải duy nhất, count_without_rule_2 = 10, most_permissive_rule = 2 không hòa', () => {
  const s = solve();
  assert.equal(s.total, 120);
  assert.equal(s.solutions.length, 1);
  assert.deepEqual(s.solutions[0], answer.schedule);
  assert.equal(s.count_without_rule_2, answer.count_without_rule_2);
  assert.deepEqual(s.mostPermissiveRules, [answer.most_permissive_rule]);
});

test('SR-16 l1: brute-force bắt đáp án sai (schedule, count, most_permissive_rule)', () => {
  assert.equal(verify(answer).ok, true);
  assert.equal(verify({ ...answer, count_without_rule_2: 9 }).ok, false);
  assert.equal(verify({ ...answer, most_permissive_rule: 3 }).ok, false);
  assert.equal(verify({ ...answer, schedule: { ...answer.schedule, Mon: 'An', Fri: 'Dung' } }).ok, false);
});

test('SR-16 l1: bỏ luật 7 làm lời giải không còn duy nhất / đổi kết quả (script nhạy với luật)', () => {
  const s = solve(RULES.slice(0, 6));
  assert.notEqual(s.solutions.length, 1);
});

test('SR-16 l1: brief khớp 7 luật mà script mã hóa (mỗi luật đúng một dòng đánh số)', () => {
  const brief = JSON.parse(fs.readFileSync(path.join(L1, 'task.json'), 'utf8')).brief;
  assert.equal(brief.split('\n').filter((l) => /^\d\. /.test(l)).length, RULES.length);
});

test('SR-16 l3: brief định nghĩa "duplicate rows" và định nghĩa đó cho ra duplicate_rows_ignored của answer.json', () => {
  const brief = JSON.parse(fs.readFileSync(path.join(L3, 'task.json'), 'utf8')).brief;
  assert.match(brief, /A duplicate row is a data row \(all six columns\) identical to an earlier row/);
  const rows = fs.readFileSync(path.join(L3, 'repo', 'transactions.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const want = JSON.parse(fs.readFileSync(path.join(L3, 'hidden', 'answer.json'), 'utf8'));
  assert.equal(rows[0].split(',').length, 6);
  assert.equal(rows.length - new Set(rows).size, want.duplicate_rows_ignored);
});
