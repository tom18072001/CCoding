# Sổ chạy E5′: B-15 chính, họp ở làn đầy đủ ép (đợt 3e, V4-3e-E5′)

Phân loại dữ liệu: **Nội bộ**. Dữ liệu là bài tổng hợp, không có dữ liệu thật.

Sổ này ghi **trước lượt đầu**, lúc 4/11/2026 13:55 giờ VN. Khi đó chưa có lượt E5′ nào: kịch bản chờ E6 xong.

| Mục | Giá trị |
|---|---|
| Đăng ký | `docs/research/preregistration.md` §9, mục V4-3e-E5′, đặt trước dữ liệu, gộp ở `f36a1d9` |
| Duyệt | Giám đốc duyệt lúc 12:50 ngày 4/11 (`local-3e/RUNLOG.md`, commit `9e3c410`) |
| Cổng (3) | **(i)** D12 đã gộp: `57148de1` (`57148de`). **(ii)** Test runtime giả "ép làn đầy đủ thì có `discuss`, thêm `discussionRounds: 0` thì không" (`bench/vs-claude/test/arms-full-lane.test.mjs`) xanh trong `npm run test:bench` 245/245. **(iii)** E6 xong: kịch bản chờ dòng "XONG phan sau" của `run3e-b.ps1`. **(iv)** Đã duyệt |
| Hash server và runner (9) | Worktree mới `C:\Users\admin\ccoding-vs-claude\ccoding-e5f`, detached ở `57148de`. `npm ci` và `npm run build` xong. Server và runner chạy chung worktree này, vì `ccodingCommit` lấy theo runner |
| Server | Cổng **7426**. `ccoding.local.json` chép từ `ccoding-3e` và chỉ đổi cổng; sha256 `D9B87197A3A687EDDDB6A7BA0C67D4DE5DD6C3878DA867C737D09B935D0867EA`. Thư mục dữ liệu `ccoding-e5f\data`. Không đụng 7420, 7425 |
| Claude Code CLI | 2.1.312 |
| Lệnh | `run.mjs --arms B0F,B1F --tasks l1-modules,l2-chain --repeats k --timeout 40 --out bench\vs-claude\results\b15f-main`, chạy với k = 1, 2, …, 10. Runner bỏ qua khóa đã `done`, nên mỗi k chỉ chạy thêm lượt r_k |
| Kịch bản | `run3e-c.ps1` (bản sao ở đây), chạy nền từ 13:52, chờ E6 |
| Kiểm cổng | `check-e5f.mjs` (bản sao ở đây), sha256 `e22f5d5ec04a5cf5d8887ef146ca8e013cec270d95be34445a0776d9a0e612d1`. Chỉ đọc `arm`, `task`, `rep`, `status`, `byPhase`; không in điểm, token hay thời gian |
| Kiểm sau r1 | Dừng 1: B0F cặp đầu của bài nào không có `discuss` thì dừng. Kiểm nhiễu: thiếu pha cấu trúc, có pha lạ, hoặc B1F mất pha ngoài `discuss`, `finalize`, `revise` thì dừng |
| Kiểm sau r2…r10 | Dừng 2: một bài có ≥ 3 cặp bị loại theo (8) thì dừng. Khi dừng, kịch bản tạo `ccoding-e5f\STOP-E5F` và giám đốc được báo |
| Hạn mức | Runner thoát mã 3 thì chờ 20 phút rồi chạy tiếp. `STOP-3e` dừng cả kịch bản này |
