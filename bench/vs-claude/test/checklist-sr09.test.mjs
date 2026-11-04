// SR-09: checklist a1/r1 chặt hơn — regex mới phạt giải pháp sai điển hình, vẫn chấp nhận tham chiếu và câu đúng.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeChecklist } from '../lib/grade.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'checklist-wrong.fixture.json'), 'utf8'));
const items = (id) => Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'tasks', id, 'hidden', 'checklist.json'), 'utf8')).items.map((i) => [i.id, i]));
const hit = (regexes, text) => regexes.some((re) => new RegExp(re, 'is').test(text));

for (const [taskId, cases] of Object.entries(FX).filter(([k]) => !k.startsWith('_'))) {
  const cur = items(taskId);
  for (const [itemId, c] of Object.entries(cases)) {
    test(`SR-09 ${taskId}/${itemId}: regex cũ cho qua câu sai, regex mới phạt`, () => {
      for (const w of c.wrong) {
        assert.ok(hit(c.legacy, w), `fixture sai phải lọt regex cũ: ${w}`);
        assert.ok(!hit(cur[itemId].regex, w), `regex mới phải phạt: ${w}`);
      }
    });
    test(`SR-09 ${taskId}/${itemId}: regex mới nhận câu đúng`, () => {
      for (const r of c.right) assert.ok(hit(cur[itemId].regex, r), `phải nhận: ${r}`);
      for (const m of c.legacyMisses ?? []) assert.ok(!hit(c.legacy, m), `regex cũ bỏ sót: ${m}`);
    });
  }
}

test('SR-09: bản tham chiếu a1/r1 vẫn đạt 1,00 qua gradeChecklist', async () => {
  for (const [id, f] of [['a1-ambiguous-spec', 'SPEC.md'], ['r1-elk-design', 'DESIGN.md']]) {
    const dir = path.join(ROOT, 'tasks', id);
    const task = JSON.parse(fs.readFileSync(path.join(dir, 'task.json'), 'utf8'));
    const r = await gradeChecklist({ workdir: path.join(dir, 'hidden', 'reference'), hiddenDir: path.join(dir, 'hidden'), finalText: '', task });
    assert.equal(task.deliverable, f);
    assert.equal(r.score, 1, `${id}: ${JSON.stringify(r.details.verdicts)}`);
  }
});

test('SR-09: câu sai điển hình bị chấm sai đúng mục qua gradeChecklist', async () => {
  for (const [id, cases] of Object.entries(FX).filter(([k]) => !k.startsWith('_'))) {
    const dir = path.join(ROOT, 'tasks', id);
    const task = JSON.parse(fs.readFileSync(path.join(dir, 'task.json'), 'utf8'));
    for (const [itemId, c] of Object.entries(cases)) {
      const r = await gradeChecklist({ workdir: path.join(dir, 'nonexistent'), hiddenDir: path.join(dir, 'hidden'), finalText: c.wrong[0], task });
      assert.equal(r.details.verdicts[itemId], false, id + "/" + itemId);
      assert.ok(r.score <= 0.5, id + "/" + itemId + ": " + r.score);
    }
  }
});
