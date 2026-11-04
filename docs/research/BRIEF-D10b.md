# Phòng Dev, D10b: đóng các việc CTO nêu khi nghiệm thu D10

Việc vừa, chạy song song được. Ngân sách 6M token. Làm trên nhánh `perf/vs-claude-loop`. Phân loại dữ liệu: **Nội bộ**.

## Căn cứ
- CTO chưa nghiệm thu D10 (T-20261103-224454-f2e). Các ý trong mục "Rủi ro & việc còn mở" của CTO đều là việc của D10b.
- Người điều phối đã gộp D10 (`7b7f4cf`) và kiểm trên Linux (`fa0c5ea`): `npm test` 391/391 ×3. Một test kỳ vọng đường dẫn hook kiểu Windows đã được sửa để kỳ vọng theo nền tảng. Chi tiết ở mục cuối của `docs/research/context/d10-implementation-2026-11-04.md`.

## Hạng mục
1. **Nút "Áp dụng" trên giao diện B-19.**
   - Giao diện phải khớp hợp đồng với route của S3: Duyệt, Từ chối, Áp dụng, Rollback có xác nhận.
   - Thêm test cho lỗi 409, kiểm thông báo lỗi đã che đường dẫn.
2. **Log sandbox không được bỏ qua im lặng (DET-04).** `logSandboxDeny` và `logSandboxUnavailable` phải có đường ghi dự phòng hoặc báo lỗi rõ khi không xác định được thư mục dữ liệu. Có test.
3. **Chính sách giữ log cho `purgeExpired`.**
   - Phải có nơi gọi và cấu hình thời hạn.
   - Thời hạn **không được ngắn hơn** quy định của AGENTS.md: nhật ký xử lý dữ liệu cốt lõi hoặc quan trọng ≥ 6 tháng; nhật ký hệ thống truy xuất ≥ 12 tháng; log làm chứng cứ thì không xóa (WORM).
   - Ghi vào `docs/data-protection-assessment.md`.
4. **Nối đủ nguồn sự cố cho B-19 bước 1:** `guard.block`, phát hiện mức blocker hoặc major của review, `regressed`. Theo `implementation-spec.md` §3, Bước 1. Có test.
5. **Số skipped dao động 3–4 trên Windows:** tìm test nào, vì sao. Sửa nếu là test chập chờn; nếu do môi trường thì ghi lý do.
6. **Hoàn tất tài liệu `d10-implementation-2026-11-04.md`**, mỗi mục B-18, B-19, B-12 ghi:
   - công tắc và giá trị mặc định;
   - tệp, commit, test;
   - việc còn cần đo hoặc cần giám đốc duyệt.

   Danh sách chờ duyệt gồm:
   - cài distro WSL2 và `claude`, bubblewrap, socat để đóng G1;
   - chạy thật `scripts/sandbox-adversarial.mjs` và `sandbox-bench.mjs`;
   - bật `osSandbox`;
   - bật `selfImprove`;
   - ngân sách và ngưỡng của A/B.
7. **Kiểm hiệu chỉnh đa phép kiểm của B-19:** đối chiếu mã với `implementation-spec.md` (Holm trên ba chỉ số chính, theo `design.md` §5.3). Nếu mã đang dùng Bonferroni thì sửa cho đúng đặc tả, hoặc ghi lý do.

## Kiểm tra
- `npm run typecheck` và `npm test` xanh, chạy 3 lần.
- Test có hành vi riêng theo nền tảng phải có kỳ vọng cho cả win32 và posix.

## Không làm
- Không bật mặc định `osSandbox` hay `selfImprove`.
- Không cài phần mềm, không chạy `claude -p`.
- Không sửa `docs/research/paper/`.
