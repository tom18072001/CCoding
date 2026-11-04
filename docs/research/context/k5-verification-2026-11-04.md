# K5 — Kiểm cuối vòng 4 gói 10 (2026-11-04)

Phân loại: Nội bộ. HEAD lúc kiểm: `149cb41`. **Kết luận: CHƯA ĐẠT tiêu chí xong.** Hai việc nền của gói chưa được làm (khóa lại holdout, chèn nội dung S4 vào `preregistration.md` và `improvement-backlog.md`), nên 3 lệnh đạt, 3 lệnh đỏ và 1 lệnh đạt sau khi sửa một lệch số dòng.

## 1. Đầu ra các lệnh

| # | Lệnh | Exit | Kết quả |
|---|---|---|---|
| 1 | `node docs/research/scripts/consistency-check.mjs` | 1 → **0 sau sửa** | Lần đầu: `paper.md:573 — c1c8-single-labeller` (1 lỗi, 47 tệp). Nguyên nhân: câu trích dẫn cũ dời từ dòng 563 sang 573 do v0.5 thêm nội dung, ngoại lệ trong `facts.json` còn ghi 563. Đã sửa số dòng ngoại lệ thành 573. Sau sửa: `Đạt: 47 tệp, không lệch số liệu.` |
| 2 | `node docs/research/self-improvement/holdout-sample-size.mjs --check` | 1 | Gọi không tham số tệp thì script lỗi `ERR_INVALID_ARG_TYPE` (script cần `--check <tệp.md>`). Gọi đúng: `... --check docs/research/self-improvement/holdout-and-sample-size.md` → `LỆCH HASH so với holdout-lock.json: c1-iis-ecs, c2-burst-alert, c3-shop-bugs, c4-audit-chain, c5-tickets-api, l1-oncall, l2-knights, l3-reconcile, l4-startup-order, s1-sec-review — dừng, không tính cỡ mẫu.` **Đỏ**: lock chưa khóa lại. |
| 3 | `node --test docs/research/analysis/gates-pairs.test.mjs` | 0 | tests 17, pass 17, fail 0 |
| 4 | `node --test bench/vs-claude/harness/stats.test.mjs` | 0 | tests 12, pass 12, fail 0 |
| 5 | `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` | 0 | `OK: 12 bảng ... trùng đầu ra script.` |
| 6 | `npm run typecheck` | 0 | `tsc -p tsconfig.json --noEmit`, không lỗi |
| 7 | `npm test` | 1 | tests 415, pass 406, **fail 4**: CT-09, CT-12, CT-13, CT-19. Đúng thiết kế: bốn test này đỏ vì lock lệch hash, chờ khóa lại. |

## 2. Vì sao lệnh 2 và 7 đỏ
- S1 dừng ở cổng rà diff (`l3-reconcile` đổi `brief`, commit `096e47d`, SR-16). Research-lead (S4) quyết định **(A) chấp nhận**, nhưng ghi rõ B-19 là "đã duyệt khóa lại, chờ băm". Không ai chạy `--hash` sau đó. `holdout-lock.json` vẫn là bản của `e59e890` (2026-11-03T21:52:41+07:00).
- S4 ghi nội dung §9 và backlog vào `context/s4-prereg-s9-backlog-2026-11-04.md` (commit `149cb41` chỉ thêm tệp này), **chưa chèn** vào `preregistration.md` và `improvement-backlog.md`. Mục V4-K2-1…7, đăng ký trước bước 2 B-14 và bảng hash cũ/mới chưa nằm trong §9.
- S6 không làm hai việc đó: phạm vi S6 chỉ cho sửa lệch số/tên trong `paper.md` và `facts.json`. Tôi không sửa lock, không sửa `src/`, test hay `bench/`.
- **Việc còn lại, theo thứ tự:** (1) chèn khối A của S4 vào §9 (ghi lý do, chưa có lượt A/B, hash cũ); (2) `node docs/research/self-improvement/holdout-sample-size.mjs --hash`, cập nhật `holdout-lock.json`, `--size`, bảng trong `holdout-and-sample-size.md`; (3) điền hash mới vào §9, đổi ghi chú B-19 thành "đã khóa lại (<commit>)"; (4) chèn phần backlog; (5) chạy lại lệnh 1, 2, 7. Nếu hash trong test đọc từ lock thì 4 test tự xanh; nếu có hằng số ghi cứng thì ghi rõ trong bàn giao.

## 3. Đối chiếu số bài báo (danh sách S5) với nguồn

Cách làm: đếm số lần xuất hiện của chuỗi số trong `paper.md` và trong tệp nguồn (`k2-stats-review`, `k4-e2-descriptive-b14-step2-n`, RUNLOG `b14-diag`, `gates-pilot`). Cột nguồn ≥ 1 nghĩa là số có trong nguồn. Mỗi số trong bài cũng đã có mẫu trong `facts.json` và qua lệnh 1.

| Số (bài) | Nguồn | Khớp |
|---|---|---|
| H2 +2,8 pp; TOST 90 % cận trên +8,3 pp | k2 (S2/S3b) | khớp |
| H7 0,00 [0,00; 1,00]; 139/4000 = 3,48 % | k2 | khớp |
| B-01 B7: 2,460 / 2,498 (token); 2,482 / 2,566 (thời gian) | k2 | khớp |
| E1 ghi cache 41 464; CLI 2.1.318 | RUNLOG b14-diag | khớp |
| E1 h = 0,98 / 0,00 / 0,98 | RUNLOG b14-diag | khớp |
| E2 28 lượt; q̂ 0/4 [0,00; 0,60]; 0/3 [0,00; 0,71]; bỏ 6 lượt; b10 chặn 1/4 | k4-e2 (S3a) | khớp |
| E2 chi phí 77 657 / 102 742 / 132 925; bỏ 6 lượt 78 182 / 105 915 | k4-e2 | khớp |
| E2 test ẩn 12/12, 11/12, 4/4 | k4-e2, RUNLOG gates-pilot | khớp |

**Lệch số: 0.** Giới hạn của cách kiểm: tôi đối chiếu bằng khớp chuỗi, không tính lại từ `runs.jsonl`; "cặp B7cab/B7cabO/B6 12/12/4 lượt" và "h" tôi chỉ kiểm hiện diện, chưa kiểm gán đúng arm. Danh sách 6 lượt "lỡ thấy điểm" là suy diễn của S3a từ thứ tự dòng (bài đã nói rõ).

## 4. Grep tên nội bộ trong `paper.md`

| Chuỗi | Số dòng khớp | Nhận xét |
|---|---|---|
| `T-2026…` (mã nhiệm vụ) | 1 → **0** | Dòng 3 có "nhiệm vụ T-20261104-110942-567 (vòng 4 gói 10)". Đã xóa (sửa tên). |
| `CCoding` | 48 | Tên hệ thống được nghiên cứu, có trong tiêu đề; không coi là lộ nội bộ. |
| `BRIEF` | 4 | Dòng 4 `docs/research/BRIEF-2.md`; dòng 632, 670, 680 nhãn nguồn `[V-BRIEF]`. |
| `SR-` | 0 | Sạch. |
| `docs/` | 20 | Đường dẫn tệp trong dòng 4, 66, 153, 163, 183, 192–194, 684… |
| `B-1` | 21 | Mã hạng mục backlog (B-10, B-11, B-12…) ở dòng 142–143, 269, 311, 315… |
| `context/`, `S[0-9]` | 1, 6 | `docs/research/context/HISTORY.md` (dòng 684); "S2", "S3" trỏ tên hạng mục (dòng 4, 93, 197, 269, 315, 632). |

**Chưa đạt "0 tên nội bộ".** Phần còn lại là ~50 chỗ có từ v0.4 (bản 1a1bb7a đã có 8 chỗ `T-2026|BRIEF`). Gỡ hay giữ là quyết định nội dung: các đường dẫn và mã B-xx là dấu vết tái lập của bài, nên không xóa máy móc được. S5 cũng đã ghi mục (5) "chưa xong". Đề nghị research-lead quyết: (a) giữ các đường dẫn như phụ lục tái lập và chỉ gỡ `BRIEF`, `S2/S3`, `T-…`; hoặc (b) một lượt rà ẩn danh riêng trước khi nộp.

## 5. Kiểm mốc thời gian
- Số lượt A/B của B-19: **0**. Bằng chứng: `git log --all -- data` rỗng; không có `runs.jsonl` nào trong `bench/vs-claude/results` chứa "selfimprove" hoặc "B-19"; khớp với kết quả của S1 (`holdout-relock-2026-11-04.md`). Giới hạn: chỉ kiểm được repo này, không kiểm được `data/` trên máy khác.
- Mốc "commit khóa lại trong §9 trước mọi lượt A/B": **không kiểm được vì chưa có commit khóa lại**. Mốc đối chiếu khi có: `902fc78` (2026-11-04T11:02:28+07:00, D11) là commit đổi bài; lock hiện hành `e59e890` (2026-11-03T21:52:41+07:00).

## 6. Đánh giá bảo vệ dữ liệu
Nội bộ; không có DLCN; không đổi luồng dữ liệu (chỉ dùng dữ liệu benchmark đã có, không ghi ngoài `data/`).

## 7. Tệp đã sửa trong S6
- `docs/research/facts.json`: ngoại lệ `c1c8-single-labeller` dòng 563 → 573, cập nhật lý do.
- `docs/research/paper/paper.md` dòng 3: bỏ mã nhiệm vụ và "vòng 4 gói 10".
- Tạo `docs/research/context/k5-verification-2026-11-04.md`.
