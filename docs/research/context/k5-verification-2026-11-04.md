# K5 — Kiểm cuối vòng 4 gói 10, viết lại theo trạng thái gói 11 (2026-11-04)

Phân loại: Nội bộ. Ngày chạy: 2026-11-04. HEAD lúc kiểm: `791e8a3` (nhánh `ccoding/t-20261104-123641-21b--s1`, nền `1a31f1f`; sau S2, S3, S4). Máy chạy: Windows 11, Node ≥ 22. Bản k5 trước (HEAD `149cb41`) ghi trạng thái trước khi khóa lại holdout nên đã lỗi thời; bản này thay thế.

**Kết luận: 7/7 lệnh đạt** (exit 0). Hai lưu ý ở mục 3: `npm test` trên Windows bỏ qua 5 test (Linux 415/415 là kết quả của BRIEF-16, không chạy lại ở đây), và `consistency-check` đỏ 1 lần do dòng R16 làm lệch số dòng ngoại lệ (đã sửa, mục 2).

## 1. Trạng thái hiện tại
| Mục | Trạng thái | Nguồn |
|---|---|---|
| Holdout B-19 | Đã khóa lại `84ded09` (2026-11-04T11:41:05+07:00); CT-09, CT-12, CT-13, CT-19 xanh | lệnh 7, lệnh 2 |
| E1 (B-14 chẩn đoán cache) | Xong; đổi bộ công cụ là nguồn ghi cache | `preregistration.md` §9 V4-3e-E1 |
| E2 (thí điểm B-12/B-16) | Xong | §9 V4-3e-E2 |
| E3 (thí điểm bài lớn, B-15) | Xong. B0 không có pha `discuss` ở cả hai bài (l1-modules: `chooseLane` quy tắc 3 chọn làn nhanh; l2-chain: làn đơn nâng lên làn nhanh). Chỉ dựa vào lane, byPhase, token, thời gian; không mở điểm | `bench/vs-claude/results/large-pilot/RUNLOG.md` |
| E4 (B-12/B-16 chính) | Đang chạy, N cố định | §9 V4-3e-E4 |
| E5 | Tạm giữ (toàn ô "thiếu dữ liệu" theo V4-3e-E5 (8)) | §9 V4-3e-E5 |
| E5′ | Đã đăng ký trước lượt đầu; chờ D12 gộp, test runtime giả xanh, E6 xong, giám đốc duyệt | §9 `#### V4-3e-E5′ — B-15 chính (họp, làn đầy đủ)` |
| K3 (S-1, SS-1…3, giới hạn bước 2 B-14) | Đã đăng ký | §9 `#### V4-3e-K3 — Quy tắc bổ sung (đặt trước dữ liệu)` |
| N-5 (ẩn danh) | Phương án đã viết, chưa làm; `paper.md` không đổi | `context/anonymization-options-2026-11-04.md` |
| `improvement-backlog.md` | B-12, B-14, B-15, B-16, B-19 đã cập nhật ở bảng §0 và tiêu đề; dòng "Cập nhật R16" | backlog |

## 2. Đầu ra các lệnh (chạy 2026-11-04, HEAD `791e8a3`, working tree có sửa backlog và `facts.json`)

| # | Lệnh | Exit | Dòng tóm tắt (nguyên văn) |
|---|---|---|---|
| 1 | `npm run typecheck` | 0 | `tsc -p tsconfig.json --noEmit`, không lỗi |
| 2 | `npm test` | 0 | `ℹ tests 415 · ℹ pass 410 · ℹ fail 0 · ℹ skipped 5 · ℹ todo 0` |
| 3 | `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` | 0 | `OK: 12 bảng trong docs/research/performance/token-analysis.md trùng đầu ra script.` |
| 4 | `node --test bench/vs-claude/harness/stats.test.mjs` | 0 | `ℹ tests 12 · ℹ pass 12 · ℹ fail 0 · ℹ skipped 0` |
| 5 | `node --test docs/research/analysis/gates-pairs.test.mjs` | 0 | `ℹ tests 17 · ℹ pass 17 · ℹ fail 0 · ℹ skipped 0` |
| 6 | `node docs/research/scripts/consistency-check.mjs` | 1 → **0 sau sửa** | Lần đầu: `docs/research/improvement-backlog.md:289 — C6-no-data — cụm lỗi thời … 1 lỗi (C6-no-data=1) trong 47 tệp.` Sau sửa: `Đạt: 47 tệp, không lệch số liệu.` |
| 7 | Khóa holdout: `node docs/research/self-improvement/holdout-sample-size.mjs --check docs/research/self-improvement/holdout-and-sample-size.md` | 0 | `OK: 120 dòng bảng trong docs/research/self-improvement/holdout-and-sample-size.md trùng đầu ra script.` (không còn `LỆCH HASH`) |

Nguyên nhân lỗi lệnh 6 lần đầu: dòng "Cập nhật R16" chèn vào đầu backlog dời câu cũ (mô tả vấn đề B-05) từ dòng 288 xuống 289, trong khi ngoại lệ `C6-no-data` ở `docs/research/facts.json` còn ghi 288. Đã sửa số dòng và lý do ngoại lệ (288 → 289). Không có lỗi ở §9 hay ở tệp mới của S2, S3, S4 (47 tệp, gồm tệp ẩn danh mới của S4).

## 3. Giới hạn
- `npm test`: 5 test bị bỏ qua trên Windows (`probe --self-test` và `probe` Ollama: chưa build `dist/`; `claude-cli bashMaxOutput`; PDF mã hóa: không có `qpdf`; `herdr logs`: herdr giả cần shebang Linux/macOS). Kết quả 415/415 chạy 3 lần trên Linux của BRIEF-16 không được chạy lại ở đây.
- Lệnh 7 là kiểm hash của bộ holdout và bảng cỡ mẫu. Test CT-09, CT-12, CT-13, CT-19 nằm trong `npm test` (lệnh 2, fail 0, không có trong 5 test bị bỏ qua theo danh sách trên).
- Chưa mở điểm E3/E4; k5 này không dùng điểm.
- Mốc thời gian B-19: số lượt A/B vẫn 0 (không có `runs.jsonl` nào của B-19 trong repo); commit khóa lại `84ded09` có trước mọi lượt A/B.

## 4. Bảo vệ dữ liệu
Nội bộ; không có DLCN; không đổi luồng dữ liệu; không ghi ngoài `data/`.

## 5. Tệp sửa trong S1
- `docs/research/improvement-backlog.md`: trạng thái 5 mục (bảng §0 và tiêu đề), dòng R16.
- `docs/research/facts.json`: số dòng ngoại lệ `C6-no-data` 288 → 289.
- `docs/research/context/k5-verification-2026-11-04.md`: viết lại.
