# Phòng Dev, gói D18d: đóng các tiêu chí CTO chưa nghiệm thu của D18c; lệch số test bị bỏ qua

**Gói nhỏ: 4 hạng mục. Ngân sách 6M token.** Giao 14/11/2026.

**Căn cứ:** biên bản nghiệm thu của CTO cho D18c (14/11): K4b chưa làm; ba lỗi nhỏ m1–m3. Số test bị bỏ qua (skipped) lệch nhau qua D18a và D18c vẫn chưa ai giải thích.

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

## Hạng mục

**K1 — senior-swe: đối chiếu `estimatePlan` với token thật (K4b của D18c)**
- **Số thật:** `bench/vs-claude/results/decisions/estimate-vs-actual.json`, 5 gói Nghiên cứu trên văn phòng phụ (BRIEF-19 đến 23). Gồm ước lượng lúc lập kế hoạch (`run.estimate`) và token thật (`usage`).
  - Tỉ số thật/ước lượng khoảng 6,1; 1,14; 1,78; 1,69; 0,45.
  - Ước lượng đã vượt ngân sách mà nhiệm vụ vẫn chạy.
- **Việc:**
  - Điền bảng vào `docs/diagnostics/estimate-research.md`.
  - Xác định ước lượng và thực tế có cùng đơn vị không (thực tế gồm cả `cacheRead`).
  - Lệch hệ thống quá 1,5 lần thì chỉnh hệ số hoặc cách gom lịch sử theo vai; có test trong `estimate-check.test.ts`.
  - Ghi rõ hành vi khi ước lượng vượt ngân sách ở `budgetMode: complete`.

**K2 — backend-dev: m1–m3 của D18c**
- **m1:** log `plan.gate` ở bước `replanned` mang theo `followupScope`.
- **m2:** xác minh `/api/audit/verify` trong `src/server.ts` khi có khóa HMAC và log cũ chưa ký; thêm `allowUnsigned` giống CLI. Có test.
- **m3:** cập nhật `docs/ARCHITECTURE.md` theo luồng vòng bổ sung và cổng kế hoạch mới.

**K3 — senior-swe: giải thích số test bị bỏ qua**
- Liệt kê **mọi** test bỏ qua có điều kiện trong `test/`: tên, điều kiện, nền tảng, lý do. Lưu vào `docs/diagnostics/skipped-tests.md`.
- Giải thích các con số đã ghi: 4 (CCoding chạy trên Windows), 3 (reviewer), 1 (Linux).
- Test nào bỏ qua vì môi trường thiếu thứ đáng lẽ phải có thì sửa, hoặc ghi rõ cách bật.

**K4 — qa-tester: review K1–K3**
- Kết luận theo mẫu JSON.
- **Kiểm sức bắt lỗi** của test mới ở D18c (`plan-gate-followup`, `accept-followup-d18b`, `plan-prompt-s1`): cố ý làm hỏng mã tương ứng, test phải đỏ. Ghi kết quả.
- 🧪 `npm run typecheck`, `npm test` phải xanh.
