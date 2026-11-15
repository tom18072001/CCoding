import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadScratchPatterns, matchScratch } from '../src/scratch.js';

// D27/K1: test biên matchScratch trên mẫu thật của repo (.ccoding/scratch.json).
const repoRoot = path.resolve(import.meta.dirname, '..');
const patterns = loadScratchPatterns(repoRoot) ?? [];

test('scratch: mẫu thật của repo đọc được', () => {
  assert.ok(patterns.includes('_*'));
  assert.ok(patterns.some((p) => p.startsWith('!')));
});

test('scratch: `_*` chỉ khớp ở gốc repo', () => {
  assert.equal(matchScratch('_x.py', patterns), true);
  assert.equal(matchScratch('docs/_x.py', patterns), false);
});

test('scratch: mẫu `!` thắng mẫu dương', () => {
  // `_FINAL.txt` lồng sâu vốn không khớp mẫu dương nào, nên kèm ca có mẫu dương khớp thật (`*.bak`) để chứng minh `!` đè được
  assert.equal(matchScratch('bench/vs-claude/results/a/_FINAL.txt', patterns), false);
  assert.equal(matchScratch('bench/vs-claude/results/a/x.bak', patterns), false);
  assert.equal(matchScratch('bench/vs-claude/tasks/a-tmp/c.js', patterns), false);
  assert.equal(matchScratch('other/x.bak', patterns), true, 'cùng mẫu dương ngoài vùng loại trừ vẫn khớp');
  // thứ tự mẫu không đổi kết quả
  assert.equal(matchScratch('r/x.bak', ['!r/**', '**/*.bak']), false);
  assert.equal(matchScratch('r/x.bak', ['**/*.bak', '!r/**']), false);
});

test('scratch: `*-tmp/**` ở mọi cấp', () => {
  assert.equal(matchScratch('a/b-tmp/c.js', patterns), true);
  assert.equal(matchScratch('b-tmp/c.js', patterns), true);
});
