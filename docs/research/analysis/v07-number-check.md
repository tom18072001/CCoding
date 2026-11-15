# Bảng kiểm số bài báo v0.7 (S6, BRIEF-20, 14/11/2026)

Phân loại: Nội bộ. Mỗi số trong `paper/v07-number-list.md` (mục A–D) được mở lại ở tệp nguồn và so với `paper.md`, gồm làm tròn và dấu phẩy thập phân. Không tính lại số của E7, E8. `results/…` = `bench/vs-claude/results/…`.

## 1. Kết quả theo nhóm

| Nhóm | Nguồn đã mở (dòng) | Kết quả |
|---|---|---|
| A1–A3 (G-1, G-2, G-3) | `g-mutation/RUNLOG.md:55–57`, `:118` | khớp |
| A4 (G-3Δ) | `RUNLOG.md:58`; `analysis/v43f-rerun.md:237` | `paper.md` khớp [−5,4; +8,8]; **RUNLOG:58 lệch** (CI cũ) → đã sửa |
| A5 (G độ nhạy) | `RUNLOG.md:132–135` | khớp (`v43f-e8-t5logq.md:8` không mở lại; số "bỏ `t5-logq`" chép nguyên) |
| A6–A8 (E4) | `gates-main/report-e4.md:9–11, 21–25, 29–31` | khớp |
| A9–A13 (E7) | `e7-cto/report.md:20–24, 35–42, 65, 72–74` | khớp |
| A14 (Youden J, ×2,6, 24 so 1) | `report.md:74` | số khớp. Nhãn [Khám phá] giữ (chọn sau khi thấy kết quả; báo cáo ghi "mô tả", bài nêu rõ) |
| A15 (theo bài) | `report.md:75` | khớp |
| A16 (16 cặp; giờ, mã lượt) | `report.md:37–38, 68, 82`; `e7-cto/RUNLOG.md:91, 109–113` | mã lượt, 09:47–09:51, 10:17–10:20, 10:37 khớp. **"ghim 10:43" không có trong RUNLOG** → đã bỏ ở `paper.md` §8.3 (v) và `v07-number-list.md` A16 |
| B1–B6 (trục 2 (b)) | `axis2-guard/report.md:8–44` | khớp |
| B7 (sha) | `git log` | `74f11d99` (khóa danh sách) nằm trước `6dac52c8` (kết quả), cả hai còn trong lịch sử, không squash |
| B8–B9 (ngưỡng, câu bắt buộc) | `preregistration.md:1207–1217`; `paper.md` §1, §2, §6.3.2, §9 | khớp; câu "chặn nhầm trên lệnh thật chưa đo, chờ giám đốc chỉ định hai người gán nhãn" có ở cả bốn chỗ |
| C1–C3 (P) | `p-parallel/RUNLOG.md:25–31, 46, 49, 55–60` | khớp |
| C4–C9 (E8) | `e8-parallel/report.md:21–23, 33–35, 37–40, 41–49, 50, 60–62` | khớp. C8: B6w4/A0 thời gian 0,59/2,08/1,36, token 1,41/3,95/2,11 đúng; nhãn [Khám phá] giữ vì chọn theo bài. Câu token dùng "không thấy thay đổi token phát hiện được (CI chứa 1)", không dùng câu "không tốn thêm token" của báo cáo (theo danh sách câu cấm) |
| D1 (E5′) | `b15f-main/report.md:9–16` | khớp (USD 56,13 và 40,71; pass 20/20 và 19/20) |
| D2 (E6) | `h6-3e/report.md:16, 23` | khớp |
| D3–D6 (B-14 bước 2) | `b14-step2/report.md:17–29, 35–47, 76–88` | khớp. "≈ 11 %" và "≈ 13 %": từ CI [0,886; 1,127] ra 11,4 % và 12,7 %, báo cáo viết "khoảng 11 %" và "khoảng 13 %"; giữ |
| E1–E11 (đoạn chữ) | `paper.md` | E1 khớp CHANGELOG (đã thêm mục). E4: sha `1568774` (`15687744`), `7ff4b9c` (`7ff4b9ca`), `0d216eb` (`0d216eb6`) đều có trong `git log`. E11: xem mục 3 |

**Số dòng lệch còn lại: 0** (hai lệch đã sửa ở mục 2).

## 2. Lệch đã sửa

| # | Chỗ | Trước | Sau | Nguồn |
|---|---|---|---|---|
| 1 | `paper.md` §8.3 (v) 1; `v07-number-list.md` A16 | "sửa và ghim lại lúc 10:43" | "sau đó sửa và ghim lại (RUNLOG không ghi giờ ghim)" | `e7-cto/RUNLOG.md:89–105` (chỉ có 10:37) |
| 2 | `results/g-mutation/RUNLOG.md:58` | CI [−4,7; +7,4] | [−5,4; +8,8], kèm "bản đầu đã thay" | `analysis/v43f-rerun.md:237` |

## 3. Đồng bộ

- **`facts.json`:** thêm 17 mục `numbers` cho `paper/paper.md`: `g3d-ci-v07`, `e7-recall-r1`, `e7-recall-r3`, `e7-fp-r1`, `e7-mcnemar-p`, `e7-reclassified-pairs`, `e8-walltask`, `e8-token`, `e8-overlap-b6w4`, `b14s2-ratio`, `b14s2-power10`, `e5p-token`, `e6-h6-verdict`, `p-critical-path`, `axis2b-gitread`, `axis2b-full`, `law-356-effective`. Kiểm bằng cách đổi thử hai giá trị: script báo lỗi, nên mẫu thực sự khớp. Dời ngoại lệ `c1c8-single-labeller` từ dòng 576 sang 667 (dòng `paper.md` đổi do chèn v0.7; nội dung câu không đổi). Không có chỗ Nghị định 13/2023 trong `facts.json` để thay.
- **Nghị định 356/2025/NĐ-CP:** `paper.md` giữ [CHƯA KIỂM CHỨNG] cho điều khoản (S1 chỉ xác nhận số hiệu, ngày ban hành 31/12/2025, hiệu lực 01/01/2026 từ cổng chính thức). Mốc "72 giờ" chỉ gắn với hai trường hợp theo nguồn thứ cấp; không viết thành quy định chung.
- **`preregistration.md` §9:** đã chèn dòng sai lệch của S1 (có giờ 13:59) sau dòng sai lệch S2 và trước §10; `git diff` chỉ có dòng thêm.
- **`CHANGELOG.md`:** thêm mục gói 14.

## 4. Lệnh kiểm

| Lệnh | Exit | Đầu ra |
|---|---|---|
| `node docs/research/scripts/consistency-check.mjs` | 0 | `Đạt: 52 tệp, không lệch số liệu.` (lần đầu sau khi chèn v0.7: 1 lỗi `c1c8-single-labeller` do dòng đổi, đã sửa ngoại lệ) |
| `npm run typecheck` | 0 | `tsc -p tsconfig.json --noEmit`, không lỗi (cần `npm ci` vì worktree chưa có `node_modules`) |
| `npm test` | 0 | tests 461, pass 458, fail 0, skipped 3 |
