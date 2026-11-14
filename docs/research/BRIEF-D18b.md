# Phòng Dev, gói D18b: hồ sơ agent, lời nhắc, KPI, nhật ký — sửa hết lỗi sửa được còn lại (FX2, FX8–FX12, FX14, FX18, FX21)

**Gói lớn: 5 hạng mục. Ngân sách 12M token.** Giao 14/11/2026, chạy song song với D18a.

**Căn cứ:**
- `docs/research/analysis/decisions/report.md` §6.1.
- `docs/research/analysis/decisions/scorecard.md`.
- `bench/vs-claude/results/decisions/kpi-office.json` và `calls-limits.json` (tổng hợp 146 lượt gọi theo pha).

**Phạm vi:**
- **Được sửa:** `agents/`, `src/` (`kpi.ts`, `config.ts`, `prompts.ts`, `logger.ts`, `estimate.ts` khi cần), `test/`, `docs/` (trừ `docs/research/`).
- Đổi định dạng `agent.md` ⇒ cập nhật `docs/AGENTS-GUIDE.md` và `test/registry.test.ts` (AGENTS.md).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

## Hạng mục

**K1 — backend-dev: lời nhắc trưởng phòng và model theo làn (FX2, FX14, FX18)**
- **FX2 (gốc của ca BRIEF-20 và BRIEF-23):** `agents/research/research-lead.md` (quanh dòng 53) cấm tạo hạng mục cho `@peer-reviewer`.
  - Thêm ngoại lệ: đề bài giao hạng mục có mã riêng cho vai reviewer thì **phải** tạo hạng mục cho vai đó.
  - Rà `dev-lead.md` xem có câu tương tự không.
  - Test registry; test lời nhắc có câu ngoại lệ.
- **FX14:** lời nhắc bóc tách có số hạng mục "1–7" trong khi `MAX_SUBTASKS = 8`. Lấy số từ hằng; một quy tắc nhất quán theo làn. Test chuỗi lời nhắc.
- **FX18:** hồ sơ trưởng phòng ghi opus nhưng làn nhanh chạy sonnet ở pha `plan`. Ghi đúng model theo làn trong hồ sơ và `docs/AGENTS-GUIDE.md`.

**K2 — senior-swe: "đầu ra bị cắt" — chẩn đoán rồi sửa (FX8)**
- **Số đo:** KPI báo 27/112 lượt "chạm giới hạn độ dài" ở 10/14 agent; `calls-limits.json` có tỉ số output/maxTokens theo pha.
  - `discuss` (maxTokens 700): 29/38 lượt vượt 1.
  - `execute`: 14/52 vượt 1, cao nhất khoảng 4,8, vì output của `claude-cli` cộng mọi vòng công cụ.
- **Bước 1, chẩn đoán từ mã:**
  - KPI tính "truncated" ở `src/kpi.ts` quanh dòng 549 (`r.truncated` hoặc `capped` mà không có công cụ). Xác định cờ đó đến từ đâu: trần vòng công cụ, trần token đầu ra của runtime, hay lượt `discuss` bị cắt 700 token.
  - Ghi bảng nguyên nhân theo pha vào `docs/diagnostics/`.
- **Bước 2, sửa theo nguyên nhân:**
  - **Nếu là chẩn đoán sai của KPI** (đếm "bị cắt" khi thật ra là chạm trần lượt hay output cộng dồn): sửa `kpi.ts`, tách hai cờ `truncated` và `turnCapped`; sửa thông báo `findings` cho đúng nguyên nhân.
  - **Nếu là giới hạn thật:** chỉnh `phases.toolTurns`/`maxTokens` theo pha, hoặc thêm lời nhắc "ghi tệp sớm".
- **Tiêu chí xong:** KPI tính lại trên dữ liệu mẫu trong test cho cờ đúng nguyên nhân. Test.

**K3 — backend-dev: hồ sơ agent theo `findings` của KPI (FX9, FX10, FX11, FX12)**
- **FX9:** `agents/dev/security.md`, `agents/research/peer-reviewer.md`. Thêm bước dò môi trường trước khi chạy lệnh: scripts trong `package.json`; shell là PowerShell hay bash. Mục tiêu: lỗi công cụ ≤ 10 %.
- **FX10:** `agents/research/data-scientist.md`. Đọc và tìm bằng công cụ tệp, không bằng `cat`/`grep`/`sed` qua shell.
- **FX11:** `no-sources` ở `academic-writer` và `methodologist`.
  - Xác định quy tắc đúng hay sai. Hạng mục thiết kế hoặc viết lại từ tệp trong repo không cần nguồn ngoài.
  - Sửa `src/kpi.ts` để miễn khi hạng mục không yêu cầu nguồn, hoặc sửa hồ sơ. Có test.
- **FX12:** trưởng phòng Nghiên cứu lập gói dùng ×2,2 ngân sách.
  - Hồ sơ `research-lead.md`: giới hạn cỡ gói, tách giai đoạn.
  - `checkEstimate` ở bước plan: ước lượng > ngân sách ⇒ cảnh báo hoặc tách trước khi chạy. Test.

**K4 — security: nhật ký có chữ ký (FX21, phần làm được trong mã)**
- `src/logger.ts`: mỗi đoạn log có chữ ký HMAC kiểm được, khóa lấy từ cấu hình hoặc biến môi trường.
  - Không ghi khóa vào log hay repo; thiếu khóa ⇒ ghi cảnh báo, chuỗi băm vẫn chạy như cũ.
- Có hàm hoặc lệnh `chainChecker` báo sai khi sửa một dòng. Test.
- Lưu trữ WORM là hạ tầng, ngoài tầm. Ghi trong `docs/` cách bật khi có hạ tầng.

**K5 — qa-tester: review K1–K4**
- Kết luận theo mẫu JSON. Mỗi FX ghi đạt hoặc chưa theo tiêu chí xong của `report.md` §6.1.
- 🧪 `npm run typecheck`, `npm test` phải xanh.
