// Đếm lỗi công cụ từ tool-failures-2026-11-02.csv (kiểm N1–N5). Chỉ đọc; in tóm tắt ra stdout.
// Chạy: node docs/research/context/failures-count.mjs [--list <category>]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(dir, "tool-failures-2026-11-02.csv"), "utf8");

function parseCsv(s) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const [head, ...body] = parseCsv(text);
const recs = body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
const by = (f) => {
  const m = new Map();
  for (const r of recs) { const k = f(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
};
const show = (t, rows) => { console.log(`\n# ${t}`); for (const [k, n] of rows) console.log(`${n}\t${k}`); };

const li = process.argv.indexOf("--list");
if (li > 0) {
  const cat = process.argv[li + 1];
  recs.forEach((r, i) => { if (r.category === cat) console.log(`${i + 1}\t${r.agent}\t${r.tool}\t${r.command_or_path.slice(0, 110).replace(/\s+/g, " ")}`); });
  process.exit(0);
}

console.log(`tổng dòng dữ liệu: ${recs.length}`);
show("theo category", by((r) => r.category));
show("theo agent", by((r) => r.agent));
show("theo agent × category", by((r) => `${r.agent} / ${r.category}`));
show("theo tool × category", by((r) => `${r.tool} / ${r.category}`));
show("theo phase", by((r) => r.phase));
show("theo task", by((r) => r.task));

// N1: git-read-deny — phân loại lệnh đầu của từng lượt
const deny = recs.filter((r) => r.category === "git-read-deny");
const first = (s) => (s.trim().match(/^[A-Za-z0-9_.\/-]+/) ?? ["?"])[0];
show("N1: git-read-deny theo lệnh đầu", Object.entries(
  deny.reduce((a, r) => (a[first(r.command_or_path)] = (a[first(r.command_or_path)] ?? 0) + 1, a), {})).sort((a, b) => b[1] - a[1]));
// Bỏ chuỗi trong nháy (và thân heredoc) trước khi tìm toán tử ghi/chạy mã, để "a|b" hay "x > y" trong regex không bị tính nhầm.
const strip = (s) => s.split("⏎")[0].replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''");
const hasRedirectOut = (s) => /(^|[^<>2&0-9])>{1,2}\s*[^&\s]/.test(s.replace(/2>&1|2>\/dev\/null|>\/dev\/null/g, ""));
const flags = deny.map((r) => {
  const c = r.command_or_path, s = strip(c);
  const writes = hasRedirectOut(s) || /<<-?\s*'?[A-Z]+/.test(c) || /\bsed\s+(-\S*i|-i)/.test(s) || /(^|[\s;&|])(rm|mv|cp|mkdir|touch|tee|chmod)\s/.test(s);
  const runsCode = /(^|[\s;&|])(node|python3?|npm|npx|tsx)\s/.test(s);
  return {
    cmd: c, writes, runsCode, readOnly: !writes && !runsCode,
    quotedSep: (c.split("⏎")[0].match(/"(?:[^"\\]|\\.)*"|'[^']*'/g) ?? []).some((q) => /[|;]/.test(q)),   // | hoặc ; nằm trong một chuỗi có nháy
    echo: /\becho\b/.test(s), sedN: /\bsed\s+-n\b/.test(s), awk: /\bawk\b/.test(s), tailC: /\btail\s+-c\b/.test(s),
    forLoop: /\bfor\s+\w+\s+in\b/.test(s), cd: /^\s*cd\b/.test(s), subst: /\$\(/.test(s),
  };
});
const cnt = (k, set = flags) => set.filter((f) => f[k]).length;
const ro = flags.filter((f) => f.readOnly);
console.log(`\n# N1: ${deny.length} lượt git-read-deny; phân loại tĩnh`);
console.log(`${ro.length}\tCHỈ ĐỌC (không ghi tệp, không chạy node/python/npm)`);
console.log(`${flags.filter((f) => f.runsCode && !f.writes).length}\tchạy mã (node/python/npm), không ghi`);
console.log(`${cnt("writes")}\tcó ghi/redirect/heredoc/sed -i (chặn đúng)`);
console.log(`# trong ${ro.length} lượt chỉ đọc, số lượt có đặc điểm sau (chồng nhau):`);
for (const k of ["quotedSep", "echo", "sedN", "awk", "tailC", "forLoop", "cd", "subst"]) console.log(`${cnt(k, ro)}\t${k}`);
console.log(`${ro.filter((f) => !f.quotedSep && !f.echo && !f.sedN && !f.awk && !f.tailC && !f.forLoop && !f.cd && !f.subst).length}\tchỉ đọc nhưng không có đặc điểm nào ở trên (nguyên nhân khác)`);
if (process.argv.includes("--ro-other")) ro.filter((f) => !f.quotedSep && !f.echo && !f.sedN && !f.awk && !f.tailC && !f.forLoop && !f.cd && !f.subst).forEach((f) => console.log("  -", f.cmd.slice(0, 160).replace(/\s+/g, " ")));
