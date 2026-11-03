// SR-05: size/sizeBasis/sizeLegacy của mọi task.json phải khớp quy tắc đếm trong README (kiểm bằng máy khi có thể).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TASKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tasks');
const UNITS = ['files', 'functions', 'answers', 'sections', 'deliverables'];
const tasks = fs.readdirSync(TASKS).filter((d) => fs.existsSync(path.join(TASKS, d, 'task.json'))).map((d) => ({ dir: path.join(TASKS, d), ...JSON.parse(fs.readFileSync(path.join(TASKS, d, 'task.json'), 'utf8')) }));

const walk = (dir, base = dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')])) : []);
const norm = (s) => s.replace(/\r\n/g, '\n');

/** Số tệp nguồn (src/, bin/) mà lời giải tham chiếu tạo mới hoặc sửa so với workspace khởi đầu. */
export function filesChanged(t) {
  const start = path.join(t.dir, t.repoDir ?? 'repo');
  const ref = t.solutionDir ? path.join(t.dir, t.solutionDir) : path.join(t.dir, 'hidden', 'solution');
  return walk(ref).filter((f) => /^(src|bin)\//.test(f)).filter((f) => !fs.existsSync(path.join(start, f)) || norm(fs.readFileSync(path.join(start, f), 'utf8')) !== norm(fs.readFileSync(path.join(ref, f), 'utf8')));
}

test('SR-05: mọi task.json có size nguyên >= 1, sizeBasis hợp lệ và sizeLegacy', () => {
  assert.ok(tasks.length >= 25);
  for (const t of tasks) {
    assert.ok(Number.isInteger(t.size) && t.size >= 1, `${t.id}: size`);
    assert.ok(Number.isInteger(t.sizeLegacy) && t.sizeLegacy >= 1, `${t.id}: sizeLegacy`);
    assert.match(t.sizeBasis ?? '', new RegExp(`^(${UNITS.join('|')}): .+`), `${t.id}: sizeBasis phải dạng "<đơn vị>: <liệt kê>"`);
  }
});

test('SR-05: size khớp số mục liệt kê trong sizeBasis', () => {
  for (const t of tasks) {
    const list = t.sizeBasis.replace(/^[a-z]+: /, '').replace(/{([^}]*)}/g, (_, a) => a.split(',').join(' ; '));
    assert.equal(list.split(/s*[,;]s*/).filter(Boolean).length, t.size, `${t.id}: ${t.sizeBasis}`);
  }
});

test('SR-05: basis "files" = số tệp src/bin mà lời giải tham chiếu tạo hoặc sửa', () => {
  const fl = tasks.filter((t) => t.sizeBasis.startsWith('files'));
  assert.ok(fl.length >= 13);
  for (const t of fl) assert.equal(filesChanged(t).length, t.size, `${t.id}: ${filesChanged(t).join(', ')}`);
});

test('SR-05: basis "answers" = số khóa của hidden/answer.json', () => {
  for (const t of tasks.filter((x) => x.sizeBasis.startsWith('answers'))) {
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(t.dir, 'hidden', 'answer.json'), 'utf8'))).length, t.size, t.id);
  }
});
