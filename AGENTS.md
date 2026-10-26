# Hướng dẫn cho coding agent làm việc trên repo CCoding

> File này dành cho AI/agent **sửa mã nguồn** của CCoding (Claude Code, Codex, Kimi…). Hồ sơ của các sub-agent *bên trong* văn phòng nằm ở `agents/`.

## Quy ước

- TypeScript ESM (`src/`), Node ≥ 22, `strict`. Import nội bộ có đuôi `.js`.
- Hạn chế phụ thuộc runtime (hiện chỉ có `yaml`). Giao diện `public/` là JS thuần, không build, không CDN bắt buộc.
- Văn bản hiển thị và thông báo lỗi bằng **tiếng Việt có dấu**.
- Mọi lượt gọi LLM phải đi qua `Orchestrator.call()` để được ghi log, đếm token và áp chính sách dữ liệu — không gọi runtime trực tiếp từ chỗ khác (trừ `agent-exec` trong pane herdr).
- Log chỉ ghi qua `LogStore` (che PII/bí mật + chuỗi băm). Không ghi dữ liệu ra ngoài `data/`.
- Thay đổi định dạng `agent.md` ⇒ cập nhật `docs/AGENTS-GUIDE.md` và `test/registry.test.ts`.

## Kiểm tra trước khi commit

```bash
npm run typecheck
npm test
```

## Data Protection Gate (bắt buộc)

Dự án tuân theo "Khung bảo vệ dữ liệu trong Quản trị dữ liệu".
- Trước khi chốt thiết kế, kịch bản hoặc thay đổi lớn về dữ liệu, AI/agent PHẢI chạy đánh giá bảo vệ dữ liệu
  (5 lớp, 25 năng lực GOV/PRE/DET/PRI/RES, pháp lý VN) và đưa khuyến nghị cho chủ dự án.
- Mọi tập dữ liệu mang nhãn nội bộ (Công khai/Nội bộ/Bảo mật/Hạn chế) + phân loại pháp lý; nhiều tiêu chí → mức cao nhất.
- Không dùng dữ liệu thật trên DEV/UAT; PII phải được che/token hóa trước khi vào log, index, môi trường phân tích.
- Nhật ký: xử lý dữ liệu cốt lõi/quan trọng ≥ 6 tháng; nhật ký hệ thống truy xuất ≥ 12 tháng; log làm chứng cứ phải bất biến (WORM, băm, ký số).
- Sự cố DLCN: thông báo ≤ 72 giờ. Chuyển xuyên biên giới / xử lý DLCN: hồ sơ đánh giá tác động.
- Kết quả đánh giá lưu tại: docs/data-protection-assessment.md
