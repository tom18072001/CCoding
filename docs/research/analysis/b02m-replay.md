# R13 — Phát lại B02-M offline: cổng B-02 trên mọi `ccoding-task.json` C1–C9

Dữ liệu: nội bộ (internal). Không tốn hạn mức LLM. Mọi bảng dưới đây (từ "Bảng từng lượt" đến hết "Ca C9") là đầu ra nguyên văn của `node docs/research/analysis/b02m-replay.mjs`.

## Giao thức (chốt trước khi chạy)

- **Hàm cổng**: chỉ import `briefMentions`, `classifyChecks` từ `src/quality-gate.ts` (commit gần nhất của tệp: `28d041d`; HEAD lúc chạy `a82c1f5`). Không sửa `src/`. Chưa có `dist/` và không có `tsc`, nên script đăng ký resolve hook (`./x.js` → `./x.ts`) và tự chạy lại với `node --experimental-transform-types` (cần vì `src/util/extract.ts` dùng parameter property). Node v24.14.0.
- **Đơn vị**: một lượt = một tệp `bench/vs-claude/results/C*/*/ccoding-task.json` (54 tệp, không phải ~55). Lấy `brief`, `projectChecks.baseline`, `projectChecks.latest`, `runs[-1].review.approved`.
- **Sự thật ("duyệt khi còn đỏ")**: `approved === true` và còn lệnh trong `latest` có `ok=false`, không `denied`, mà `brief` nhắc tên lệnh (`briefMentions`).
- **Cổng chặn**: có ít nhất một lệnh xếp `red-required` bởi `classifyChecks` (đúng `forceUnapproved`, `orchestrator.ts:3018-3027`). Biến thể rộng thêm `regression-or-new` (`orchestrator.ts:1370`).
- **Khoảng tin cậy**: Clopper–Pearson 95 % hai phía, tính bằng chia đôi trên hàm phân phối nhị thức (không phụ thuộc thư viện).
- **Ngưỡng**: §4.5 (`improvement-backlog.md:226`) **không** đặt số ca tối thiểu; dòng R8 chỉ nêu "0 lượt approved khi lệnh đòi xanh còn đỏ" và "phát lại C9 phải bắt `t5-logq.ccoding-fastlane.2`". Tôi không tự đặt ngưỡng n; báo n và khoảng tin cậy.

## Tóm tắt kết quả

- Phát lại được 54/54 lượt, không lượt nào thiếu trường (số "không phát lại được" = **0**).
- **Ca C9 `t5-logq.ccoding-fastlane.2` bị bắt**: baseline `npm test` đỏ, sau vẫn đỏ, đề bài nhắc `npm test` ⇒ `red-required` ⇒ `forceUnapproved`; thực tế reviewer đã `approved=true`.
- Chặn nhầm lượt xanh: **0/53**, khoảng tin cậy 95 % [0 %; 6,7 %].
- Độ nhạy: **1/1**, [2,5 %; 100 %] — chỉ có **một** ca dương thật trong 54 lượt nên không thể nói gì về độ nhạy ngoài ca này.
- **Phán quyết B-02 theo §4.5: KHÔNG ĐỦ DỮ LIỆU** (chi tiết dưới).

## Bảng từng lượt

| Lượt | làn | approved | baseline | sau (latest) | phân loại cổng | thật: duyệt khi còn đỏ | cổng chặn |
|---|---|---|---|---|---|---|---|
| C1/t1-duration.ccoding.1 | - | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C1/t1-duration.ccoding.2 | - | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C1/t2-orders.ccoding.1 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C1/t2-orders.ccoding.2 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C1/t3-api.ccoding.1 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C1/t3-api.ccoding.2 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C1/t4-perf.ccoding.1 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C1/t4-perf.ccoding.2 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C2/t1-duration.ccoding-fast.1 | - | false | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C2/t1-duration.ccoding-sonlead.1 | - | false | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C2/t5-logq.ccoding.1 | - | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C2/t5-logq.ccoding.2 | - | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C3/t1-duration.ccoding-new.1 | - | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C3/t2-orders.ccoding-new.1 | - | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C4/t1-duration.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C4/t2-orders.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C4/t3-api.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C4/t4-perf.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C4/t5-logq.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C5/t1-duration.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C5/t1-duration.ccoding-fastlane.2 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C5/t2-orders.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C5/t2-orders.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C5/t3-api.ccoding-fastlane.1 | fast | false | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C5/t3-api.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C5/t4-perf.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C5/t4-perf.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C5/t5-logq.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C5/t5-logq.ccoding-fastlane.2 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C6/t3-api.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C6/t3-api.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C6/t5-logq.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C6/t5-logq.ccoding-fastlane.2 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C7/t1-duration.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C7/t2-orders.ccoding-fastlane.1 | fast | false | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C7/t3-api.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C7/t4-perf.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C7/t5-logq.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C8/t2-orders.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C8/t2-orders.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C8/t2-orders.ccoding-fastlane.3 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t1-duration.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C9/t1-duration.ccoding-fastlane.2 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C9/t1-duration.ccoding-fastlane.3 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C9/t2-orders.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t2-orders.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t2-orders.ccoding-fastlane.3 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t3-api.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t3-api.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t3-api.ccoding-fastlane.3 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t4-perf.ccoding-fastlane.1 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t4-perf.ccoding-fastlane.2 | fast | true | npm test:xanh | npm test:xanh | npm test:green | không | không |
| C9/t5-logq.ccoding-fastlane.1 | fast | true | npm test:đỏ | npm test:xanh | npm test:green | không | không |
| C9/t5-logq.ccoding-fastlane.2 | fast | true | npm test:đỏ | npm test:đỏ | npm test:red-required | CÓ | CHẶN |

## Ma trận nhầm lẫn (chính: cổng = `forceUnapproved`, tức có lệnh `red-required`)

| | cổng chặn | cổng không chặn | tổng |
|---|---|---|---|
| thật sự "duyệt khi còn đỏ" | 1 | 0 | 1 |
| lượt xanh / không duyệt-khi-đỏ | 0 | 53 | 53 |

- n phát lại được = 54; không phát lại được = 0 (tổng 54 tệp).
- Tỷ lệ bắt đúng (độ nhạy) = 1/1 = 100,0 % [2,5 %; 100,0 %] (Clopper–Pearson 95 %).
- Tỷ lệ chặn nhầm = 0/53 = 0,0 % [0,0 %; 6,7 %] (Clopper–Pearson 95 %).
- Lượt bị bắt đúng: C9/t5-logq.ccoding-fastlane.2.
- Lượt bỏ sót (duyệt khi còn đỏ mà cổng không chặn): không có.
- **Lượt xanh bị chặn nhầm (0):** không có.

### Biến thể

- Cổng rộng (chặn cả `regression-or-new`): bắt 1/1, chặn nhầm 0/53.
- Sự thật rộng ("duyệt khi có bất kỳ lệnh đỏ", không cần đề bài nhắc tên): thật = 1; cổng chính bắt 1, bỏ sót 0.

## Ca C9 t5-logq.ccoding-fastlane.2

approved=true; baseline: npm test:đỏ; sau: npm test:đỏ; phân loại: npm test:red-required; lệnh đề bài đòi xanh còn đỏ: npm test; cổng BẮT ĐƯỢC (chặn).

## Phán quyết B-02 theo §4.5

| Dòng §4.5 | Đo được offline? | Kết quả |
|---|---|---|
| (R8) Lượt `approved` khi lệnh đề bài đòi xanh còn đỏ = 0; phát lại phải bắt `t5-logq.ccoding-fastlane.2` | Có | Bắt được ca t5 (1/1); chặn nhầm 0/53. Đạt về tiêu chí đã nêu, nhưng n dương = 1 |
| Test ẩn không kém Claude Code đơn (biên 2 điểm %) | Không (cần chạy mới) | Không đủ dữ liệu |
| `templateCoverage` = 100 % làn đơn | Không phát lại: `ccoding-task.json` không lưu văn bản đầu ra để chạy `templateGate`; chưa thử đọc `finalPath` | Chưa phát lại |
| Reviewer bị bỏ khi mã đỏ = số sự kiện `checks.run` đỏ | Không (cần log `checks.run`, `phases.csv`) | Không đủ dữ liệu |
| Số vòng sửa ≤ N=2 | Không (cần log) | Không đủ dữ liệu |
| KPI phòng ≥ baseline | Không | Không đủ dữ liệu |
| Hiệu quả ±15 % | Không phát lại offline | Không đủ dữ liệu |

**Phán quyết: không đủ dữ liệu.** Dòng R8 (cái duy nhất phát lại offline được) thỏa tiêu chí văn bản của §4.5, nhưng chỉ dựa trên một ca dương (cận dưới độ nhạy 2,5 %), và các dòng còn lại cần chạy mới hoặc log chưa có. Không ghi "đạt" cho B-02 cả gói. Hệ quả cho S3: biện pháp B-11(a) vẫn bị chặn theo quy tắc "phán quyết không phải 'đạt'".

## Giới hạn

- **Vòng lặp một phần**: "lệnh đề bài đòi xanh" xác định bằng chính `briefMentions` của cổng, nên với `red-required` độ nhạy trên tập này gần như là hệ quả định nghĩa. Cổng chỉ được kiểm thật ở nhánh baseline đỏ + còn đỏ; các lượt `latest` đều xanh (53/54) nên phần "chặn nhầm 0" chủ yếu phản ánh việc lệnh xanh được xếp `green`, ít thử thách logic `briefMentions`.
- Trường hợp `denied`, `latest` thiếu lệnh trong `checkCommands`, hay nhiều lệnh kiểm tra: dữ liệu chỉ có 1 lệnh (`npm test`) mỗi lượt, nên các nhánh `red-unrelated`/`regression-or-new` không được thử.
- `ccoding-task.json` là trạng thái cuối: không biết trình tự (reviewer có chạy trước hay sau lệnh kiểm tra); `approved` là kết luận cuối của run cuối.
- Bốn lượt có `approved=false` (C2 t1 ×2, C5 t3 #1, C7 t2) do reviewer không trả JSON hoặc lỗi hạn mức, không liên quan cổng; cổng không chặn chúng và chúng không thuộc nhóm dương.
- Chưa phát lại `templateGate`, `needsReviewer`, `reviewerReasons` (thiếu văn bản đầu ra/diff trong tệp). Ghi nhận là chưa chạy.
- Ca t5 là kết quả cổng phát hiện được **sau sự cố** (cổng viết từ ca này, theo R8) — phát lại một ca đã biết trước, không phải kiểm tra mù.

## Tái lập

```bash
node docs/research/analysis/b02m-replay.mjs            # in ra bảng; thêm --json để ghi b02m-replay.json
node docs/research/scripts/consistency-check.mjs
```

Môi trường: Node v24.14.0, không phụ thuộc gói ngoài.
