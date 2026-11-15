# Đề bài vòng 3, gói 2c, cho Phòng Nghiên cứu (2/11/2026): sửa nốt lỗi major H6 chạm trần trước khi khóa đăng ký trước

Gói 2b (T-20261102-183435-da7) đã được gộp vào `perf/vs-claude-loop`. H1 và H2 đã hạ xuống thành ước lượng kèm CI, đúng hướng. Còn **1 major** và vài minor do peer-reviewer nêu. Gói này chỉ sửa đúng những điểm đó.

**Giới hạn:** tối đa 2 hạng mục, ngân sách 1,5M token. Không sửa `src/` hay `bench/`.

## Bối cảnh mới
- Giám đốc đã mở **phiên Claude Code cloud** chạy bộ đo theo `docs/research/run-plan.md`. Hiện chạy W1 (A0-sonnet, B0 × R9 × 3 lượt). Kết quả được push dần vào `bench/vs-claude/results/study-cloud/`.
- Theo đăng ký trước, **không phân tích giữa chừng**. Phòng chỉ dùng dữ liệu đó để kiểm đặc tả.
- Nhánh đã gộp `main`. Bộ đo đủ 18 bài (13 bài + t1–t5); oracle đạt 1,00. Có arm B6 (làn nhanh) và B7 (làn đơn, chờ B-01).
- Phòng Dev đang làm B-01, B-02, B-10 (T-20261102-190606-b2e).

## Hạng mục

**G1 — methodologist: sửa major H6.**
- Lỗi: H6 trong họ Holm có thể được "xác nhận" chỉ vì điểm chạm trần.
  - Trong pilot, 8/13 bài đạt 1,00 ở B0 và B5. Ở các bài đó, bootstrap luôn cho Δ* = 0, kéo trung bình về 0 và làm co phương sai.
  - Vì thế phép tương đương mất ý nghĩa: test 3 của SR-26.
  - Vị trí: `preregistration.md` §2.5 (dòng 89–90, 98, 100), §2.7 (dòng 143), §3.1 H6 (dòng 164); `suite-review.md` đặc tả SR-26 phần H6.
- Chọn và lập luận một cách sửa, ví dụ:
  - loại các bài chạm trần ở cả hai arm khỏi phép tương đương H6 (định nghĩa "chạm trần" trước khi có dữ liệu);
  - chỉ chạy H6 trên các bài không chạm trần, gồm l1-modules, l2-chain, t1–t5, và báo số bài còn lại;
  - đổi H6 sang ước lượng kèm CI, như đã làm với H1/H2.
- Cập nhật bảng p_min và cột "Trước 5/11" cho nhất quán.

**G2 — methodologist hoặc data-scientist: sửa các minor của review gói 2b.**
1. **H3:** chỉ có 1 bài (s1), r = 10 mỗi arm. Cân nhắc dùng phép hoán vị hai mẫu chính xác (C(20,10) = 184 756) thay cho bootstrap; ghi lựa chọn và lý do.
2. **`suite-review.md` SR-25 test 9:** xóa câu "so sánh T* − margin với T_obs − margin". Chỉ giữ định nghĩa b′ = b − margin, rồi mới hoán vị.
3. **§3.1 cột "Phép kiểm" của H3 và H6:** ghi "họ Holm K = 2 nếu SR-26 xong (§2.5)".
4. **`token-analysis.md`:** viết lại các đoạn "Đọc T-*" cho khớp bảng mới có C9. Thêm SR chính thức cho nhãn "C7" đang viết cứng trong `token-analysis.mjs` (T-i, T-h).
5. **`run-plan.md`:**
   - Dòng tóm tắt "`pilot*` không tồn tại" sửa lại, vì đã có `results/pilot1/`.
   - Thêm vào checklist cửa sổ bước kiểm "rep chạy lại ≠ rep đã loại", giữ cho tới khi SR-01(d) được gộp.

## Tiêu chí xong
- Peer-reviewer không còn major.
- `token-analysis --check` và `stats.test` vẫn xanh (CCoding tự chạy).
- Ghi thay đổi vào CHANGELOG.
