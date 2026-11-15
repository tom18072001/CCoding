// Đề bài mới (docs/research/BRIEF-*.md) phải qua được cổng kế hoạch. Dùng briefItems() và needsCommand() của src/plan-gate.ts (không chép; có xét phủ định "không cần chạy lệnh").
//  - có ít nhất một hạng mục K;
//  - mỗi K ghi đúng một vai, có trong agents/<phòng>/ của phòng ghi ở tiêu đề, và briefItems() nhận ra vai đó
//    (vai một từ như devops chỉ được nhận khi viết @devops);
//  - vai không có công cụ chạy lệnh (agent không có Bash) thì thân K không được đòi chạy lệnh (phép kiểm (vi) của checkPlanReadable);
//  - có **Phạm vi:**, dòng "Dữ liệu:" với đúng một nhãn, dòng ngân sách.
// Nguồn: BRIEF-D14…D16 (tên vai không có trong danh sách agent); BRIEF-22c lần 1 (peer-reviewer bị đòi chạy lệnh, dừng ở cổng kế hoạch).
import { loadTs } from '../lib/load-ts.mjs';

const DEPTS = [
  [/^#\s*Phòng\s+(?:Dev|Phát\s+triển)\b/iu, 'dev'],
  [/^#\s*Phòng\s+Nghiên\s+cứu\b/iu, 'research'],
];
const LABELS = ['Công khai', 'Nội bộ', 'Bảo mật', 'Hạn chế'];

function toolsOf(text) {
  const m = /^tools:\s*\[([^\]]*)\]/m.exec(text);
  return m ? m[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
}

export default {
  id: 'brief-lint',
  source: 'BRIEF-D14…D16 (vai không có trong danh sách), BRIEF-22c lần 1 (vai chỉ đọc bị đòi chạy lệnh)',
  needsBase: false,
  async run(ctx) {
    const { briefItems, briefItemBodies, needsCommand } = await loadTs(ctx.root, 'src/plan-gate.ts');
    const out = [];
    for (const file of ctx.files.filter((f) => /^docs\/research\/BRIEF-[^/]+\.md$/.test(f))) {
      const text = ctx.read(file);
      const name = file.split('/').pop();
      const err = (msg, line = 0) => out.push({ file, line, msg: `${msg} (đề bài ${name})` });
      const lines = text.split(/\r?\n/);
      const title = lines.find((l) => /^#\s/.test(l)) ?? '';
      const dept = DEPTS.find(([re]) => re.test(title))?.[1];
      if (!dept) err('tiêu đề phải bắt đầu "# Phòng Dev" hoặc "# Phòng Nghiên cứu" để biết tra vai ở agents/<phòng>/', 1);
      const items = briefItems(text);
      const bodies = briefItemBodies(text);
      if (!items.length) err('không có hạng mục K nào theo briefItems() (dòng "K1 — vai: …")');
      for (const it of items) {
        const at = lines.findIndex((l) => l.trim() === it.line) + 1;
        const roles = it.roles ?? (it.role ? [it.role] : []);
        if (!roles.length) {
          err(`${it.code}: briefItems() không nhận ra vai (vai một từ như devops phải viết @devops)`, at);
          continue;
        }
        if (roles.length > 1) err(`${it.code}: ghi ${roles.length} vai (${roles.join(', ')}) — mỗi K đúng một vai`, at);
        const role = it.role;
        if (!dept) continue;
        const agentFile = `agents/${dept}/${role}.md`;
        if (!ctx.files.includes(agentFile)) {
          err(`${it.code}: vai "${role}" không có trong agents/${dept}/`, at);
          continue;
        }
        if (!toolsOf(ctx.read(agentFile)).includes('bash') && needsCommand(bodies[it.code] ?? it.line)) {
          err(`${it.code}: vai ${role} không có công cụ chạy lệnh (agents/${dept}/${role}.md) nhưng thân hạng mục đòi chạy lệnh — chuyển việc chạy lệnh cho vai có Bash`, at);
        }
      }
      if (!/\*\*Phạm vi:?\*\*:?/u.test(text)) err('thiếu **Phạm vi:**');
      const dl = lines.filter((l) => /^\s*(?:[-*]\s*)?(?:\*\*)?Dữ liệu(?:\*\*)?\s*:/iu.test(l));
      if (dl.length !== 1) err(dl.length ? `có ${dl.length} dòng "Dữ liệu:" (cần đúng một)` : 'thiếu dòng "Dữ liệu:" kèm nhãn (Công khai, Nội bộ, Bảo mật, Hạn chế)');
      else {
        const found = LABELS.filter((x) => new RegExp(`(?<![\p{L}])${x}(?![\p{L}])`, 'iu').test(dl[0]));
        if (found.length !== 1) err(`dòng "Dữ liệu:" phải có đúng một nhãn trong ${LABELS.join(', ')}, đang có ${found.length}`, lines.indexOf(dl[0]) + 1);
      }
      if (!/Ngân sách[^\n]{0,40}?\d[\d.,]*\s*M\s*token/iu.test(text)) err('thiếu dòng ngân sách ("Ngân sách <số>M token")');
    }
    return out;
  },
};
