// K3 — đường dẫn máy (tên người dùng, thư mục tạm của máy cloud) trong tệp chữ đã track.
// Chỗ giữ chỗ (<bạn>, ..., …, x, %USERNAME%, $HOME…) không tính. Thông điệp không chép đường dẫn.
//
// Phạm vi: mọi tệp chữ đã track. Ổ đĩa + Users và /home|/Users/<tên>/ bắt ở mọi nơi; thư mục tạm (/tmp/, /var/folders/,
// AppData, Local, Temp) chỉ bắt ở tệp không phải mã trong docs/ và bench/vs-claude/results/ (nơi đường dẫn máy cloud đã lọt vào
// báo cáo); trong mã và ví dụ lệnh, /tmp/… là chuỗi thử hợp lệ.
const SEG = String.raw`[^\\/\s"'<>|*?:)(\]\[,;` + '`' + `]+`;
const PATTERNS = [
  { id: 'ổ đĩa + Users', re: new RegExp(String.raw`[A-Za-z]:[\\/]+Users[\\/]+(` + SEG + ')', 'g'), name: 1, records: false },
  { id: '/home/<tên>/', re: new RegExp(String.raw`(?<![\w.\-/:\\])/home/(` + SEG + ')/', 'g'), name: 1, records: false },
  { id: '/Users/<tên>/', re: new RegExp(String.raw`(?<![\w.\-/:\\])/Users/(` + SEG + ')/', 'g'), name: 1, records: false },
  { id: 'thư mục tạm /tmp/', re: /(?<![\w.\-/])\/tmp\/[A-Za-z0-9_.-]+/g, name: 0, records: true },
  { id: 'thư mục tạm macOS /var/folders/', re: /(?<![\w.\-/])\/var\/folders\//g, name: 0, records: true },
  { id: 'AppData\\Local\\Temp', re: /AppData[\\/]+Local[\\/]+Temp/gi, name: 0, records: true },
];
const RECORDS = /^(?:docs\/|bench\/vs-claude\/results\/)/;
const CODE = /\.(?:[cm]?[jt]s|css)$/i;
export const isPlaceholder = (n) => /^(?:[xX]|\*+|\.{2,}|…+)$/.test(n) || /^(?:<|\$|%|\{|\.{2,}|…)/.test(n);

export function findMachinePaths(line, recordsArea = true) {
  const hits = [];
  for (const p of PATTERNS) {
    if (p.records && !recordsArea) continue;
    p.re.lastIndex = 0;
    for (const m of line.matchAll(p.re)) {
      if (p.name && isPlaceholder(m[p.name])) continue;
      hits.push(p.id);
      break;
    }
  }
  return hits;
}

export default {
  id: 'machine-path',
  source: 'docs/data-protection-assessment.md — PRE/DET (che đường dẫn máy); BRIEF-21 tiêu chí 8',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (file === 'scripts/lint/rules/machine-path.mjs') continue; // mẫu regex
      let text;
      try {
        text = ctx.read(file);
      } catch {
        continue;
      }
      if (text.slice(0, 8192).includes('\u0000')) continue;
      const isCode = CODE.test(file);
      const recordsArea = !isCode && RECORDS.test(file);
      text.split(/\r?\n/).forEach((line, i) => {
        const ids = findMachinePaths(line, recordsArea);
        if (ids.length) out.push({ file, line: i + 1, msg: `đường dẫn máy (${ids.join(', ')}) — thay bằng <máy-chạy>/<máy-cloud> hoặc chỗ giữ chỗ` });
      });
    }
    return out;
  },
};
