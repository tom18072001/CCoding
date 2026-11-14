# B-14 bước 2: A/B `runtimes.claude-cli.stablePrefix` — báo cáo kết quả

> Đăng ký trước: `docs/research/preregistration.md` §9 "Đăng ký trước bước 2 của B-14" (1)–(10) và V4-3e-(c). Chạy 5/11–12/11/2026 (nhật ký: `RUNLOG.md`, `b14-run.txt`). Phân tích 13/11/2026 bằng `docs/research/analysis/b14-step2.mjs` (bản sửa cách gom dòng chạy lại, xem mục 4); số liệu máy đọc: `analysis.json`.

## 1. Thiết kế (nhắc lại)

- **Câu hỏi:** bật `stablePrefix` (giữ phần đầu lời nhắc ổn định để cache prompt dùng lại được) có giảm token có trọng số của arm B7 không.
- **Bài:** `t2-orders`, `t3-api`, `t4-perf`. **Nhánh:** `off` / `on`, cùng commit server `0d216eb`, CLI 2.1.318, cấu hình chỉ khác công tắc (sha256 `4bc56eaf…` / `3899ac69…`).
- **Thứ tự:** ABBA, 8 khối × 12 lượt; 16 lượt mỗi ô (bài × nhánh), N = 96.
- **Phép kiểm chính:** T = trung bình theo bài của (TB ln weighted bật − TB ln weighted tắt); R̂ = exp(T). p hai phía bằng `permStratified` (hoán vị trong bài, M = 10 000, hạt 20261104). CI 95 % bằng bootstrap phân tầng (4000 vòng). "Giảm" khi p ≤ 0,05 và cận trên CI < 1.

## 2. Kết quả chính

| | Giá trị |
|---|---|
| Số lượt dùng được | **96 / 96** (16 mỗi ô; đủ 4 cặp khối) |
| R̂ = exp(T) | **0,999** |
| CI 95 % bootstrap | **[0,886; 1,127]** |
| p hai phía (Monte Carlo) | **0,983** |
| Phán quyết | **không phân biệt được** |

Trong ba bài này, bật `stablePrefix` **không cho thay đổi token có trọng số phát hiện được**. Khoảng tin cậy vẫn tương thích với hai khả năng: tiết kiệm tới khoảng 11 %, hoặc tốn thêm tới khoảng 13 %. "Không phân biệt được" không phải bằng chứng là không có hiệu ứng.

**Lực thống kê thấp hơn kế hoạch.** σ quan sát gộp trong bài là 0,312, trong khi kế hoạch dùng 0,182 (lấy từ dữ liệu B7 cũ). Ở N = 96:

- mức tiết kiệm nhỏ nhất phát hiện được (power 0,8) khoảng **16,3 %**;
- power ở mức kế hoạch 10 % chỉ khoảng **0,38**, ở 5 % khoảng 0,13.

Muốn phát hiện 10 % với σ = 0,312 cần khoảng 46 lượt mỗi ô, tổng khoảng 276 lượt. Con số này tính bằng cùng công thức xấp xỉ chuẩn của §9 (4), làm tròn lên. Giới hạn 2 của V4-3e-(c) đã nêu trước rủi ro này: chọn bài có σ thấp có thể làm thiếu N.

## 3. Phân tích độ nhạy

| Phân tích | n | R̂ | CI 95 % | p | Phán quyết |
|---|--:|--:|---|--:|---|
| **Chính** (mục 2) | 96 | 0,999 | [0,886; 1,127] | 0,983 | không phân biệt được |
| Bỏ lượt `off × t3-api × r1` (chạy sớm hơn phần còn lại của khối 1 khoảng 7 ngày; RUNLOG "Hạn mức tuần") | 95 | 0,988 | [0,872; 1,117] | 0,841 | không phân biệt được |
| Cách gom dòng của bản đầu (giữ dòng đầu mỗi khóa; mục 4) | 71 | 0,974 | [0,841; 1,134] | 0,733 | không phân biệt được |

**Bỏ từng bài** (V4-3e-(c) mục 3, đăng ký trước; chỉ mô tả):

| Bỏ bài | R̂ | CI 95 % | Cờ |
|---|--:|---|---|
| t2-orders | 0,988 | [0,873; 1,117] | — |
| t3-api | 0,999 | [0,874; 1,139] | — |
| t4-perf | 1,008 | [0,847; 1,198] | nhạy với bài |

Cờ "nhạy với bài" khi bỏ `t4-perf` bật theo đúng quy tắc đăng ký: R̂ đổi phía so với 1. Nhưng T chính gần như bằng 0 (−0,001), nên chỉ cần dịch rất nhỏ là đổi phía; vị trí của CI so với 1 không đổi (cả ba đều chứa 1). Phán quyết không phụ thuộc vào việc bỏ bài nào.

## 4. Sai lệch phân tích: cách gom các lần chạy lại cùng khóa

- **Nguyên nhân:**
  - Runner chạy lại **đúng khóa** (bài, rep) khi dòng là `infra` (hạn mức, lỗi hạ tầng) hoặc chưa xong (`failed` không có `excluded`); xem `bench/vs-claude/lib/queue.mjs` `isFinishedRow`.
  - Bản đầu của `b14-step2.mjs` lại giữ **dòng đầu** của mỗi khóa và đếm các dòng sau là "trùng khóa". Vì vậy 60 dòng hạn mức tuần trước `off × t2-orders × r1`, cùng các dòng `infra` khác, chặn mất lượt `done` của chính khóa đó, và n chỉ còn 71.
- **Sửa (13/11/2026, `collapseRetries`):**
  - dòng `infra` không phải quan sát;
  - với mỗi khóa, lượt `done` đầu tiên là quan sát;
  - dòng không xong đứng trước lượt `done` bị loại theo (8) ("status ≠ done"), và lượt `done` đó được tính là lượt thay cùng khóa, vào trần 2 lượt thay mỗi ô.
  - Bản đầu vẫn chạy lại được bằng `--retries first`. Test 10–12 trong `b14-step2.test.mjs` kiểm các trường hợp này.
- **Thứ tự sự việc:** người điều phối chạy bản đầu một lần trên dữ liệu thật và thấy kết quả (n = 71; R̂ 0,974) trước khi phát hiện lỗi. Cách sửa suy ra từ quy tắc (8) và thiết kế runner, không từ kết quả. Cả hai bản cùng phán quyết, và cả hai đều có trong bảng mục 3.
- **Dòng bị loại (bản chính):**
  - 88 dòng `infra`: tắt 75, bật 13;
  - 2 dòng `failed` (lỗi, không phải hết giờ) ở nhánh tắt, khối 8: `t4-perf r14` (90 s) và `t3-api r15` (130 s). Mỗi dòng có lượt `done` cùng khóa ngay trong khối 8, nên mỗi ô dùng 1/2 lượt thay;
  - không có lượt nào bị loại theo token, h hay điểm.

## 5. Thước đo phụ (mô tả, không p)

| Bài | Nhánh | n | h trung vị | 1,25·cacheWrite / weighted |
|---|---|--:|--:|--:|
| t2-orders | tắt | 16 | 0,785 | 0,402 |
| t3-api | tắt | 16 | 0,840 | 0,341 |
| t4-perf | tắt | 16 | 0,785 | 0,391 |
| t2-orders | bật | 16 | 0,795 | 0,376 |
| t3-api | bật | 16 | 0,835 | 0,332 |
| t4-perf | bật | 16 | 0,762 | 0,398 |

| Nhánh | n | pass | CP 95 % | score TB | wallSec TB (trung vị) | calls TB (trung vị) |
|---|--:|--:|---|--:|--:|--:|
| tắt | 48 | 97,9 % | [88,9 %; 99,9 %] | 1,000 | 189,7 (180,3) | 4,0 (5,0) |
| bật | 48 | 91,7 % | [80,0 %; 97,7 %] | 0,997 | 192,9 (200,4) | 4,0 (5,0) |

- **Tỉ lệ cache:** tỉ lệ đọc cache (h) và phần chi phí ghi cache (1,25·cacheWrite / weighted) gần như không đổi giữa hai nhánh, chênh không quá 0,03 ở mọi bài. Điều này khớp với kết quả chính: trong cấu hình này, công tắc không làm phần ghi cache giảm thấy được. Đây là mô tả; không có phép kiểm.
- **Pass:** nhánh bật có 4 lượt không đạt, nhánh tắt có 1 (score TB 0,997 so với 1,000). Hai CI Clopper–Pearson chồng nhau rộng. Chỉ số này không được đăng ký để kiểm và không đủ để nói công tắc làm giảm chất lượng; ghi lại để lần đo sau theo dõi.

## 6. Hệ quả cho quyết định

- Theo (10), `stablePrefix` **giữ tắt** cho tới khi giám đốc duyệt. Dữ liệu này **không** ủng hộ việc bật: không thấy tiết kiệm token, còn pass mô tả hơi thấp hơn ở nhánh bật.
- Nếu vẫn cần trả lời câu hỏi ở mức 10 %, phải chạy khoảng 276 lượt (mục 2). Với lực hiện tại, nên ưu tiên các hạng mục khác trong backlog.
- Kết luận chỉ áp cho ba bài này, với arm B7, CLI 2.1.318 và commit `0d216eb` (giới hạn 2 của V4-3e-(c)).
