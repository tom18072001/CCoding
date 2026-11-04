Mốc khóa đăng ký trước: `8941103` (commit gộp T-20261104-110942-567, BRIEF-16).

# Sổ chạy bước 2 của B-14: A/B `runtimes.claude-cli.stablePrefix`

Phân loại dữ liệu: **Nội bộ**. Sổ này ghi trước mọi lượt. Lúc ghi chưa có dòng dữ liệu nào.

| Mục | Giá trị |
|---|---|
| Đăng ký | `docs/research/preregistration.md` §9, "Đăng ký trước bước 2 của B-14" |
| Duyệt | Giám đốc duyệt lúc 12:50 ngày 4/11/2026 (`results/local-3e/RUNLOG.md`, commit `9e3c410`). Chạy local, sau E5′ |
| Tiền điều kiện (6) | Script `docs/research/analysis/b14-step2.mjs` có test, kèm hash commit. **Chưa có**, giao cho BRIEF-18 K1 |
| Tiền điều kiện (7) | Bộ test lệnh ác ý cho chế độ `stablePrefix` (B-14 trường 7(c)) xanh trên commit ghim. Hiện có `test/claude-stable-prefix.test.ts` và `test/shell-policy-adversarial.test.ts`, xanh trong `npm test` 415/415 ở `8c6d2d1`. Đối chiếu đủ danh sách ca giao cho BRIEF-18 K3(b), ca nào thiếu thì D13 K6 thêm |
| Commit ghim server (9) | Ghi khi dựng, trước khối 1. Phải chứa B-14b |
| Cấu hình hai nhánh | Ghi sha256 của hai `ccoding.local.json` và `diff` giữa chúng trước khối 1. Diff chỉ được khác đúng khóa `stablePrefix` |
| Lịch | ABBA theo khối 4 lượt: tắt, bật, bật, tắt, tắt, bật, bật, tắt. Mỗi lần đổi nhánh ghi giờ UTC và sha256 cấu hình |
