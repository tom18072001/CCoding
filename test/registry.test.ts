import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { Registry } from '../src/registry.js';

const SECTIONS = ['## Sứ mệnh', '## Trách nhiệm', '## Chuyên môn & kỹ năng', '## Quy trình làm việc', '## Mẫu đầu ra', '## Phối hợp & bàn giao', '## Definition of Done', '## Giới hạn & an toàn'];

test('agent.md và hồ sơ phòng ban hợp lệ', () => {
  const r = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
  assert.deepEqual(r.errors, []);
  assert.deepEqual([...r.departments.keys()].sort(), ['dev', 'research']);
  assert.equal(r.department('dev').members.length, 9);
  assert.equal(r.department('research').members.length, 6);
  assert.equal(r.router()?.id, 'orchestrator');
  for (const d of r.departments.values()) {
    assert.equal(r.agent(d.lead).role, 'lead', `${d.id} lead`);
    assert.equal(r.agent(d.reviewer).role, 'reviewer', `${d.id} reviewer`);
    assert.ok(d.keywords.length >= 20, `${d.id} keywords`);
  }
  for (const a of r.agents.values()) {
    for (const s of SECTIONS) assert.ok(a.body.includes(s), `${a.id} thiếu mục ${s}`);
    assert.ok(a.skills.length >= 5, `${a.id} skills`);
    assert.match(a.look.shirt, /^#[0-9a-f]{6}$/i);
    assert.ok(['opus', 'sonnet', 'haiku'].includes(a.model), `${a.id} model`);
    assert.ok(a.short.length > 0 && a.short.length <= 14, `${a.id} short "${a.short}" quá dài cho sơ đồ`);
    assert.ok(!/^(Đạt|Minh|Khoa|Bảo|Lan|Hùng|Tuấn|Hà|Ngọc|Phúc|An|Thư|Đức|Vy|Nam|Quân)$/.test(a.name), `${a.id} vẫn dùng tên người`);
  }
});
