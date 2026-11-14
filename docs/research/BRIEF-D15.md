# Phòng Dev, gói D15: lượt gọi trả lỗi kèm văn bản bị dùng làm kết quả (nghiệm thu "không đọc được" rồi vẫn giao)

**Gói nhỏ: 2 hạng mục + review. Ngân sách 3M token.** Giao 13/11/2026. Căn cứ: `bench/vs-claude/results/e7-cto/RUNLOG.md`, mục "Bước 2 xong; 16 lượt R1/R2 lỗi xác thực…"; §9 "Sai lệch thực thi E7…".
- **Được sửa:** `src/`, `test/`, `docs/` liên quan.
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Phân loại dữ liệu: **Nội bộ**.

## Hiện tượng (đã đo, E7 ngày 13/11)

- 16 lượt nghiệm thu (bước `accept`) gặp lỗi `Failed to authenticate. API Error: 403 Attention Required! | Cloudflare`.
- Runtime `claude-cli` trả **cả** `error` **lẫn** `text` (chính là thông báo lỗi). Bước accept chỉ coi là lỗi khi `!res.text` (`src/orchestrator.ts`, quanh chỗ gọi `parseAcceptance`), nên đưa thông báo lỗi vào `parseAcceptance`, ghi nghiệm thu "không đọc được", rồi vẫn giao kết quả. Khi vận hành thật, một lỗi hạ tầng thoáng qua vì thế thành "giao mà không nghiệm thu", và không ai được báo.
- Trong cùng các khoảng thời gian đó, `claude -p` gọi thẳng (không qua runtime CCoding) vẫn chạy bình thường.

## Hạng mục

**K1 — dev-backend: lượt gọi có `error` không bao giờ được dùng `text` làm kết quả**
- Rà mọi chỗ trong `src/orchestrator.ts` dùng `res.text` sau `call()`: accept, plan, report, review, sửa xung đột, và các khâu khác nếu có. Với mỗi chỗ: `res.error` khác rỗng thì xử lý như lỗi lượt gọi (thử lại hoặc chuyển runtime theo cấu hình; hết lượt thử thì báo lỗi rõ cho người dùng), **không** đọc `res.text` như sản phẩm.
- Riêng accept: lỗi hạ tầng không được ghi thành "không đọc được kết luận".
- Hành vi chạm trần lượt (`capped`, không có `error`) **giữ nguyên**: văn bản assistant vẫn được đọc như hiện nay.
- Test: runtime giả trả `{ text: '<thông báo lỗi>', error: '<thông báo lỗi>' }` ở từng khâu → không có nghiệm thu "không đọc được", có lỗi hoặc tạm dừng rõ ràng; ca `capped` không đổi.

**K2 — dev-backend: chẩn đoán vì sao 403 chỉ xảy ra trên đường runtime của CCoding (không sửa cách đăng nhập)**
- So môi trường, cờ và thư mục làm việc giữa `src/runtimes/claude-cli.ts` (`scrubEnv`: `CI=1`, `CCODING_AGENT=1`, `npm_config_*`, …) và `bench/vs-claude/lib/claude.mjs` (`claudeEnv`).
- Liệt kê các khác biệt có thể ảnh hưởng tới bước xác thực (biến môi trường, cờ CLI, `cwd`), ghi vào `docs/` dưới dạng ghi chú chẩn đoán, có nhãn [CHƯA KIỂM CHỨNG] cho giả thuyết chưa thử được.
- **Không** đổi cơ chế đăng nhập. **Không** thêm khóa API. Không dùng 9router.

**K3 — code-reviewer:** review K1–K2. "🧪 Lệnh kiểm tra của dự án" (`npm run typecheck`, `npm test`) phải xanh.
