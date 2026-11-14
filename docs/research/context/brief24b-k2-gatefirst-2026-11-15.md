# BRIEF-24b · K2 — đối chiếu gateFirst và tính nhất quán §9 (15/11/2026, @methodologist)

Phân loại: Nội bộ. Không chạy planner, không gọi LLM, không chạy `prereg-lock` (việc của K1).

## 1. Bảng đối chiếu gateFirst

| | Vị trí | Nguyên văn / cách tính |
|---|---|---|
| §9 (5) | `preregistration.md:1374` | "Cổng đạt lần đầu = `planGate` ... hiểu theo đúng trường này cùng `replanCount` = 0, không đặt định nghĩa mới" |
| §9 (S3) | `preregistration.md:1443` | "Lượt 'đạt lần đầu' ⇔ `planGate?.ok === true` **và** `replanCount === 0`; `planGate` `null` ⇒ không đạt (báo riêng số `null`). Cần @data-scientist kiểm trên dòng thật đầu tiên rằng `ok` đúng là trường đó" |
| Mã | `analysis/e9lite.mjs:45-50` | `planGate` null/không phải object ⇒ `null`; `planGate.replanned === true` ⇒ 0; `replanCount` là số > 0 ⇒ 0; còn lại ⇒ 1 |
| Test | `analysis/e9lite.test.mjs:95-98` | dùng `{ rules: [] }`, `{ rules:['A'], replanned:true }`; `planGate:null` ⇒ `null` |
| Kiểu thật | `src/types.ts:334`; gán ở `src/orchestrator.ts:2739`, `:2778` | `{ uncovered, reasons, rules, replanned? }` — **không có `ok`** |
| Ghi vào dòng | `bench/vs-claude/lib/plan-only.mjs:73` | `planGate: p?.planGate ?? null`, `replanCount: p?.planReplans ?? null` |
| Chỉ có `ok` ở | `bench/vs-claude/test/plan-only-arms.test.mjs:64` | runtime giả `planGate: { ok: true }` |

Chỗ lệch:
1. §9 (S3) dùng `ok`, trường **không tồn tại** ở engine ⇒ áp đúng chữ thì mọi lượt thật là "không đạt". §9 sai (không cài được).
2. §9 (S3): `planGate` null ⇒ không đạt (0); mã trả `null` (NA, bị loại khỏi trung bình).
3. §9 (S3): `replanCount === 0` chặt; mã coi `replanCount` null/thiếu là đạt (chỉ chặn khi số > 0).
4. Mã dùng `replanned` (đúng engine) mà §9 không nhắc.

## 2. Quyết định

**§9 sai ⇒ đã THÊM khối "Đính chính gateFirst (BRIEF-24b, K2; ghi trước lượt chạy đầu)" ở cuối §9**, ngay trước `## 10` (`preregistration.md`, sau khối (S3)). Khối chỉ thay đúng gạch đầu dòng "Cổng đạt lần đầu" của (S3), không sửa chữ cũ, không chạm §10. Mã của K1 phải khớp khối này.
(Dòng §10 có đường dẫn máy cloud dịch xuống 27 dòng (diff: 27 dòng '+', 0 dòng '-') vì khối mới; ngoại lệ `allow.json` neo theo chữ nên không ảnh hưởng. K1 nhớ chạy `--add-new` **sau** khi khối sha256 của K1 đã nằm trong §9.)

## 3. Đặc tả cho K1

Hàm `gateFirst(row)` trong `e9lite.mjs`:
```js
const g = row.planGate;
if (g == null || typeof g !== 'object') return 0;
if (g.replanned === true) return 0;
return row.replanCount === 0 ? 1 : 0;
```
- Đầu vào: một dòng `runs.jsonl`. Đầu ra: **0 hoặc 1, không bao giờ `null`**. `ok`, `rules`, `uncovered`, `reasons` không tham gia.
- `rowMetrics`: `m.gateFirst` luôn là số; thêm bộ đếm báo riêng (đưa vào đầu ra `analyze`/`format`): `nGateNull`, `nReplanCountMissing`, `nReplanned`. Đếm trên các dòng **đã chọn** (`kept`).
- Ca biên: không có lượt nào cho (bài, arm) ⇒ không có giá trị (như thước khác, không bịa 0); nhiều lượt lặp ⇒ trung bình 0/1 theo bài (đã có ở `perTask`); `planGate` là chuỗi/số ⇒ 0 và tính vào `nGateNull`.
- Ca biên nhãn (không liên quan gateFirst nhưng cùng khối): `G_f` rỗng ⇒ độ phủ NA và nhãn `khong_chia_duoc`, báo riêng.

Ví dụ cho test (vào ⇒ ra):
| # | row | gateFirst |
|---|---|---|
| 1 | `{ planGate:{uncovered:[],reasons:[],rules:[]}, replanCount:0 }` | 1 |
| 2 | `{ planGate:{uncovered:['x'],reasons:['r'],rules:['A'],replanned:true}, replanCount:1 }` | 0 |
| 3 | `{ planGate:{rules:[]}, replanCount:1 }` | 0 |
| 4 | `{ planGate:null, replanCount:0 }` | **0** (cũ: `null`); `nGateNull`=1 |
| 5 | `{ planGate:{rules:[]}, replanCount:null }` | **0** (cũ: 1); `nReplanCountMissing`=1 |
| 6 | `{ planGate:{ok:false,rules:[]}, replanCount:0 }` | 1 (`ok` bị bỏ qua) |
| 7 | `{ planGate:{rules:[]}, replanned…}` thiếu `replanCount` | 0 |
| 8 | 3 lượt lặp của một bài: 1, 0, 1 | chỉ số bài = 2/3 |

Sửa test `e9lite.test.mjs:98` (null ⇒ 0) và thêm các ca 5–8. Nếu K1 thấy đặc tả không cài được: dừng và ghi lý do vào bàn giao, không tự đổi định nghĩa.

## 4. Đặc tả cờ dừng/cảnh báo M1, M2 (cho K1; §9 (4)/(7) ở `1368`, `1389`)

- **M1** (`stopFlags`, `e9lite.mjs:88`): hiện lọc `authSource != null` nên bỏ qua null. §9 `1389` chỉ nói dừng khi lẫn phiên đăng nhập và khóa API. Đặc tả: dòng `status:'done'` **không phải runtime giả** (`planModel.actual` không bắt đầu `mock-`; runtime giả ghi `authSource:'none'`, xem `plan-only-arms.test.mjs:126`) mà `authSource == null` ⇒ **cảnh báo** (không dừng, không bỏ qua): trả riêng `warnings` (mảng chuỗi, vd. `authSource null ở N dòng done (runtime thật): <khóa>`), `format` in ở đầu bảng, exit vẫn 0. Dòng không `done` (lỗi hạ tầng, chưa có lượt gọi nên `authSource` null theo `lib/ccoding.mjs:20-27`) không cảnh báo, chỉ đếm. Các cờ dừng sẵn có (khóa API, lẫn nhiều giá trị khác null) giữ.
  - Test (runs.jsonl giả): (a) 3 dòng done `authSource:'subscription'` ⇒ không cờ, không cảnh báo; (b) 1 dòng done runtime thật `authSource:null` ⇒ `warnings.length===1`, `flags` rỗng; (c) dòng `status:'error'` `authSource:null` ⇒ không cảnh báo; (d) dòng giả `authSource:'none'`, `planModel.actual:'mock-x'` ⇒ không cảnh báo; (e) `'subscription'` + `'api-key'` ⇒ cờ dừng.
- **M2** (`e9lite.mjs:94-97`): hiện bỏ qua null và chỉ so các giá trị khác null. Đặc tả: tập giá trị của `ccodingCommit` (và `claudeCliVersion`) tính **cả null như một giá trị riêng**; kích thước > 1 ⇒ cờ dừng (exit 3). Tất cả null ⇒ cảnh báo "không ghi phiên bản" (không dừng).
  - Test: (a) hai commit khác nhau ⇒ cờ; (b) hai phiên bản CLI khác nhau ⇒ cờ; (c) một dòng null + còn lại có giá trị ⇒ cờ; (d) toàn trùng ⇒ rỗng; (e) toàn null ⇒ chỉ cảnh báo.
  - Đây là cách đọc chặt nhất của "phải trùng ở mọi dòng của đợt" (§9 `1368`); nếu K1 thấy dòng lỗi hạ tầng thật sự thiếu trường này thì báo lại, không nới.

## 5. Checklist nhất quán §9 ↔ mã ↔ README

| # | Mục | §9 | Mã | README | Kết luận · người sửa |
|---|---|---|---|---|---|
| 1 | Nhãn chỉ lọc added/modified | `1413-1415` (S1) | `e9lite-labels.mjs:11-13`; `e9lite.mjs:110-113` | không nêu quy tắc | **Khớp** mã. README dòng 7 chỉ viện dẫn mục "Sai lệch E9 → E9-lite", chưa nhắc sửa S1 ⇒ K3 |
| 2 | `G_f` rỗng ⇒ NA và "không chia được" | `1356`, `1415` | `coverage` trả `null` (`e9lite.mjs:37`); `label` ⇒ `khong_chia_duoc` khi 0 module (`e9lite-labels.mjs:13`) | không nêu | **Khớp**. K1: có test cho `G_f` rỗng nếu chưa có (kiểm `e9lite.test.mjs`); báo riêng bài NA trong `format` (chưa xác minh, K1 kiểm) |
| 3 | Luật khớp | `1371` (i)–(iv), `1445` | `normPath` `e9lite.mjs:18-25` | — | **Lệch nhỏ:** mã không có (iv) tệp ngoài repo (`/…`, `X:/`, `..`) tách riêng như `1445`. K1: thêm đếm "tệp ngoài repo" (không khớp, không vào module) và test; nếu đã nằm trong chỗ khác thì ghi rõ |
| 4 | Câu cấm | `1391-1394`, `1419` | `format` (kiểm chứa nhãn [Khám phá], n, khoảng) | — | K1 kiểm `format` in "[Khám phá]", n, khoảng, và câu "theo bố cục thư mục của lời giải mẫu"; thiếu ⇒ K1. K3 kiểm paper.md/README không chứa câu cấm (vd. "Opus bóc tách tốt hơn", "E9 đã chạy") |
| 5 | M1 authSource null (runtime thật) ⇒ cảnh báo | `1389` chỉ nói lẫn khóa API | `e9lite.mjs:88-92` bỏ null | — | **Lệch mã** ⇒ K1 theo mục 4. §9 không mâu thuẫn (không cấm cảnh báo) nên không cần đính chính |
| 6 | M2 commit/CLI khác nhau ⇒ dừng | `1368` | `e9lite.mjs:94-97` bỏ null | — | Một phần khớp; null chưa tính ⇒ K1 theo mục 4. Chưa có test ⇒ K1 |
| 7 | gateFirst | khối Đính chính (mới) | `e9lite.mjs:45-50` | — | **Lệch mã** (null ⇒ 0, `replanCount` không phải số ⇒ 0, bộ đếm) ⇒ K1; sửa `e9lite.test.mjs:98` |
| 8 | Dòng sha256 `labels.json` | `1406` (cũ: 13/13, hash `602cea5c…`) lỗi thời theo `1415` | `labels.json` hiện hành | `README.md:7`, `:13` | K1 sinh lại và thêm khối **mới** (không sửa `1406`); README ⇒ K3 |
| 9 | Số nhãn 13/13 | `1406`, `1415` | — | `README.md:7` | README, paper.md, facts.json ⇒ K3 theo số thật K1 báo |
| 10 | Tên mục cho hash | `1345` "dòng ngay dưới mục này" | — | — | Không sửa chữ cũ; khối K1 nói rõ khối cũ lỗi thời |
| 11 | Chỗ giữ chỗ ở paper.md (nhãn mới, sha256) | — | — | — | K3 |
| 12 | `gold.json` có `sha256` nội bộ | `1406` (`a33c0886…`) | — | — | K1 so sánh sau khi sinh lại; nếu `gold.json` đổi byte, ghi cả hash cũ lẫn mới |

Ghi chú về những gì tôi **chưa** kiểm sâu (K1/K3 xác minh): nội dung `format` và `e9lite.test.mjs` ngoài các dòng 95–98 và 21; `paper.md`, `facts.json`, `CHANGELOG.md` (ngoài phạm vi K2, K3 sẽ đối chiếu).
