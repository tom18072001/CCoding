// S4 (FX9–FX11): hồ sơ có bước dò môi trường, quy định công cụ đọc, quy tắc dẫn nguồn theo loại hạng mục.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

test('FX9: security và peer-reviewer có bước dò môi trường (scripts, shell) và mục tiêu lỗi công cụ', () => {
  for (const p of ['agents/dev/security.md', 'agents/research/peer-reviewer.md']) {
    const t = read(p);
    assert.match(t, /Dò môi trường trước khi chạy lệnh/, p);
    assert.match(t, /`scripts` trong `package\.json`/, p);
    assert.match(t, /PowerShell hay bash/, p);
    assert.match(t, /≤ 10 %/, p);
  }
});

test('FX10: data-scientist đọc/tìm bằng read_file/search/list_files, không cat/grep/sed qua shell', () => {
  const t = read('agents/research/data-scientist.md');
  assert.match(t, /`read_file`\/`search`\/`list_files`/);
  assert.match(t, /KHÔNG dùng `cat`\/`grep`\/`sed`/);
});

test('FX11: academic-writer và methodologist nêu loại hạng mục phải dẫn nguồn ngoài và loại dẫn tệp repo', () => {
  for (const p of ['agents/research/academic-writer.md', 'agents/research/methodologist.md']) {
    const t = read(p);
    assert.match(t, /Dẫn nguồn theo loại hạng mục/, p);
    assert.match(t, /PHẢI dẫn nguồn ngoài/, p);
    assert.match(t, /dẫn tệp trong repo/, p);
    assert.match(t, /no-sources/, p);
  }
});
