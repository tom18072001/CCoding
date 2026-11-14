import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('.tmp-s3/s30.json', 'utf8'));
const L = [ // [nhãn, lý do] theo thứ tự mẫu
['đúng ý','dòng 2676 là chữ ký `awaitPlanApproval`, đúng bước "duyệt kế hoạch" của hàng.'],
['đúng ý','dòng 1972 gọi `setPhase(…, \'execute\')`, đúng pha execute của hàng.'],
['đúng ý','dòng 2914 là chữ ký `withWtLock` (dải 2912–2914 gồm chú thích và chữ ký), đúng "khóa khi tách/gộp".'],
['đúng ý','dải 3143–3147 gồm chú thích "Hạng mục KHÔNG coi là xong" và khai báo `unresolved`, đúng câu "hủy merge, không coi là xong".'],
['đúng ý','dải 3428–3545 bắt đầu bằng chữ ký `runQualityGate`, là cả thân hàm mà hàng mô tả.'],
['đúng ý','dòng 2665 gán `task.attention` ngay sau "vẫn trượt → dừng", ngay sau đó ném lỗi: đúng "ném lỗi và attention".'],
['đúng ý','dòng 2428 là chữ ký `checkBudget`.'],
['đúng ý','dòng 312 `id = \'claude-cli\'` là runtime `claude-cli`.'],
['đúng ý','dòng 2625 ghi log `gate.decision` với msg "cổng phủ kế hoạch", khớp "orch:2625 phủ kế hoạch".'],
['đúng ý','dải 51–63 là cả hàm `toolsFor`; nội dung (route/discuss rỗng; plan/synthesize/accept chỉ đọc; review đọc + run_command) khớp câu.'],
['đúng ý','dòng 52 trả `[]` cho `route`, khớp "không dùng ở pha route".'],
['đúng ý','dòng 1337 là chữ ký `acceptMode`, kiểu trả về đúng ba chế độ full/brief/skip.'],
['đúng ý','dòng 1566 chọn người bằng `skillScore` trong `pickLane`, khớp "chọn ở làn đơn qua skillScore".'],
['đúng ý','dòng 1351 là chữ ký `private async route`, đúng "Định tuyến".'],
['đúng ý','dải 2254–2335 là thân `executeAll`; có `maxParallel` (dòng 2290) và lịch chạy/gộp, khớp hàng "Lịch chạy song song, maxParallel, gộp".'],
['không rõ','dòng 58 có quy tắc "không tạo hạng mục review chung cho @peer-reviewer", nhưng kèm "Ngoại lệ" mà câu bỏ qua; đầu mục L1 đã chú thích ngoại lệ do D18b thêm, nên mức khớp tùy cách đọc "dặn không tạo".'],
['đúng ý','dòng 1250 là `if (r.parsed && !r.accepted)` đặt `task.attention` (cần xem) mà không đổi `status`, khớp hệ quả mô tả.'],
['đúng ý','dòng 418 là chữ ký `outsideWriteViolation`, được liệt kê là một trong ba hàm của shell-policy.'],
['đúng ý','dòng 2941 nằm trong nhánh `if (!wt)` "không tách được worktree con → làm trong worktree chính", khớp "lùi về worktree chính".'],
['đúng ý','dải 3493–3498 là phần kiểm mẫu trong `runQualityGate` lặp qua `done()` và gọi `templateGate(…, owner.body)`, khớp "chỉ kiểm done() theo hồ sơ người làm".'],
['đúng ý','dòng 2428 là chữ ký `checkBudget`, khớp hàng "Ngân sách".'],
['không rõ','dòng 3494 chỉ là `let templateOk = true;` (khởi đầu khối kiểm mẫu); việc FINAL không đi qua cổng chỉ suy ra từ vòng `done()` ở dòng 3496, không thấy ở dòng đã khớp.'],
['đúng ý','dòng 628 khai báo `READ_NAMES`, đúng hằng được nhắc.'],
['đúng ý','dòng 1974 là điều kiện `!task.projectChecks?.baseline` rồi chạy baseline, là cơ chế kiểm tra dự án của B-02.'],
['đúng ý','dòng 203 là `"changes"` liệt kê đúng 4 tệp (parse.js, query.js, 2 test), khớp "chỉ chạm parse.js, query.js và 2 tệp test".'],
['đúng ý','dòng 175 là `"summary"` chứa "# tests 148 · # suites 0", đúng chuỗi trích.'],
['đúng ý','dòng 1355 khai báo `router`, ngay sau chú thích B-01 "ép làn đơn → định tuyến bằng từ khóa".'],
['đúng ý','dòng 180 có `taskOptions: spec.options ?? {}`, đúng chuỗi trích.'],
['đúng ý','dòng 2008 là `if (!canReview || !reviewer)`, nhánh bỏ review mà mục F-E2 nói tới.'],
['đúng ý','dòng 1165 là `this.save(task, true)`, đầu dải xấp xỉ 1165–1172 mà câu nói là "một chỗ xấp xỉ" (dòng 1172 là hết chú thích kề dưới).'],
];
const BS = String.fromCharCode(92);
const esc = (s) => s.split("|").join(BS + "|");
const code = (s) => { const t = esc(s); return s.includes('`') ? '`` ' + t + ' ``' : '`' + t + '`'; };
const rows = j.sample.map((s, i) => {
  const [f, l] = s.where.split(/:(?=\d+$)/);
  const line = fs.readFileSync(f, 'utf8').split('\n')[l - 1];
  const needle = '`' + s.ref.replace('–', '-');
  let k = line.indexOf(needle); if (k < 0) k = line.indexOf(s.ref.replace('–', '-')); if (k < 0) k = line.indexOf(s.ref);
  let a = Math.max(0, k - 150); const pre = line.slice(a, k); const cut = Math.max(pre.lastIndexOf('. '), pre.lastIndexOf('| '), pre.lastIndexOf('— '));
  if (cut >= 0) a += cut + 2;
  const b = Math.min(line.length, k + 110);
  const sent0 = line.slice(a, b).trim().replace(/[ ]*[|][ ]*$/, ""); const sent = (a > 0 ? '…' : '') + sent0 + (b < line.length ? '…' : '');
  return `| ${i + 1} | ${s.where} | ${code(sent)} | ${s.ref} | ${code(s.symbol)} | ${code(s.real)} (dòng ${s.matchedLine}) | ${L[i][0]} | ${esc(L[i][1])} | — |`;
});
fs.writeFileSync('.tmp-s3/rows.md', rows.join('\n') + '\n');
console.log(rows.length, L.length);
