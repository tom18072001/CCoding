// Chạy một script nghiên cứu có sẵn (không sửa script) và đổi kết quả thành lỗi của rule.
// Script exit khác 0 ⇒ lỗi, kèm dòng cuối đầu ra. Dòng "LỆCH <tệp>:<dòng> — …" (logic-map-check) thành lỗi riêng từng dòng.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function runScript(ctx, scriptRel, args) {
  const abs = path.join(ctx.root, scriptRel);
  if (!fs.existsSync(abs)) return [{ file: scriptRel, line: 0, msg: 'không thấy script — rule không chạy được' }];
  const r = spawnSync(process.execPath, [abs, ...args], { cwd: ctx.root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error) return [{ file: scriptRel, line: 0, msg: `không chạy được script: ${r.error.message}` }];
  if (r.status === 0) return [];
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.replace(/\r/g, '');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const l of lines) {
    const m = /^LỆCH\s+(\S+?):(\d+)\s+—\s+(.*)$/u.exec(l);
    if (m) out.push({ file: m[1], line: Number(m[2]), msg: m[3] });
  }
  if (!out.length) {
    const last = lines.at(-1) ?? '(không có đầu ra)';
    out.push({ file: scriptRel, line: 0, msg: `exit ${r.status ?? r.signal}: ${last}` });
  }
  return out;
}
