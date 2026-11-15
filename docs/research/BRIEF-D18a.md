# Phòng Dev, gói D18a: engine và cổng — sửa hết lỗi sửa được (FX của BRIEF-22, phần còn lại của D16b và D17)

**Gói lớn: 5 hạng mục. Ngân sách 12M token.** Giao 14/11/2026. Giám đốc: "ở bản final, phải sửa cho đến khi hết các lỗi vặt, những lỗi có thể sửa".

**Căn cứ:**
- `docs/research/analysis/decisions/report.md` §6.1 (FX1–FX21).
- Biên bản nghiệm thu của CTO cho D16b và D17 (14/11).
- Phát hiện của người điều phối khi chạy `briefItems` trên đề bài thật (mục K1).

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`, `agents/`. Gói D18b sửa `agents/` và KPI, chạy song song; giữ thay đổi gọn theo vùng.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

## Hạng mục

**K1 — backend-dev: cổng `brief-item` miễn sai hạng mục cuối, nên không bắt được đúng ca gốc**
- **Ca thật.** `briefItems(docs/research/BRIEF-20.md)` trả K4 (peer-reviewer) là `exempt`. Thân hạng mục cuối kéo tới hết tệp, gồm cả tiêu đề `## Không làm`, và `BELOW_SKIP_RE` khớp tiêu đề đó. Hệ quả: chạy cổng trên kế hoạch thật của BRIEF-20 (`test/fixtures/brief-item/plan-brief20.json`) **không chặn**, dù kế hoạch bỏ K4. Cùng lỗi ở BRIEF-21 K4, BRIEF-D16b K5.
- **Sửa:**
  - thân hạng mục kết thúc ở tiêu đề Markdown kế tiếp hoặc ở hạng mục mã kế tiếp;
  - chỉ xét cụm "không làm"/"chờ" trong thân đó.
- **Một dòng hạng mục nêu nhiều vai** (vd. `K4 — academic-writer, peer-reviewer:`): đọc danh sách vai. Có vai review thì ràng như vai review. Ca thật: kế hoạch BRIEF-23 (`plan-brief23.json`) không có hạng mục nào cho peer-reviewer.
- **Test** (đề bài đọc từ `docs/research/BRIEF-*.md`, kế hoạch từ fixture):
  - BRIEF-20 + `plan-brief20.json` ⇒ chặn K4;
  - BRIEF-23 + `plan-brief23.json` ⇒ chặn K4;
  - BRIEF-22 (K7 peer-reviewer có hạng mục đúng vai) ⇒ đạt;
  - mục "Không làm" thật ở cuối đề ⇒ không tạo hạng mục ảo.

**K2 — backend-dev: trạng thái nhiệm vụ và dấu vết review (FX4, FX5 phần b, FX15, FX16)**
- **FX4:** review tắt hoặc không có reviewer, và không có lệnh kiểm tra ⇒ `run.review = { skipped: true, reason }`, `attention` "chưa review", sự kiện log riêng. Test.
- **FX5 (b):** nhiệm vụ trước có `accepted=false, parsed=true` sau khi hết vòng bổ sung ⇒ nhiệm vụ `after` **không** tự chạy; trạng thái chờ có lý do. Test.
- **FX15:** người nhận không khớp roster ⇒ cổng B báo. Hạng mục cần chạy lệnh không được rơi về agent không có `run_command`. Test `parsePlan`/`planGate`.
- **FX16:** FINAL của trưởng phòng qua cổng mẫu đầu ra; thiếu mục bắt buộc ⇒ cờ trong `gate.decision`. Test.

**K3 — senior-swe: ước lượng đường găng; KPI nhất quán; test còn thiếu của vòng bổ sung (FX13, FX17, D17)**
- **FX13:** `estimatePlan` trả thêm `criticalPathEstimate` và `parallelism = work/cp` dự kiến. Ghi vào log `plan`. Test trên kế hoạch mẫu.
- **FX17:**
  - `kpi --json` ghi rõ định nghĩa `tasksCounted` so với `tasksByStatus` (hoặc làm hai số khớp nhau);
  - thêm dòng KPI cho điều phối viên: chi phí route, tỉ lệ lùi về `keywordRoute`.
  - Test.
- **D17 còn thiếu test** (CTO nêu), mỗi đường một test:
  - tiếp tục sau tạm dừng giữa vòng bổ sung;
  - hết hạn mức 5 giờ giữa vòng bổ sung;
  - vòng bổ sung ở làn đầy;
  - `attention.detail` có mã K;
  - log `gate.review` ở mức luồng orchestrator.

**K4 — security: bộ kiểm lệnh — đường còn lại, chặn nhầm, kiểm bộ kiểm (FX7 phần còn lại, D16b)**
- **FX7:**
  - quyết định và ghi lý do: `runCheckCommand` có cần rule `outside-root-write` không (lệnh kiểm tra do cấu hình dự án đặt, không do agent viết);
  - nối rule vào đường chạy lệnh của `cli-agents` (codex/kimi) nếu có đường ghi;
  - bảng lệnh chạy qua mọi đường.
- **D16b:**
  - phân loại ca heredoc chứa `../src/...` và `---` bị chặn: rule nào chặn, có phải chặn nhầm không; nếu chặn nhầm thì sửa và thêm vào bảng lệnh dev;
  - **kiểm bộ kiểm:** cố ý làm hỏng từng nhánh của `outsideWriteViolation` (đích `rm`, `cp`, chuyển hướng, `wget -O`, `curl -o`) ⇒ test phải đỏ; ghi kết quả;
  - giải thích lệch số skipped giữa các lần chạy (617/4 so với 618/3; Linux 1): test nào, vì sao;
  - nhiệm vụ `paused` cũ còn `FINAL.md` tạm: thêm bước dọn hoặc ghi chú khi tiếp tục.
  - Ba minor của review D16b: khoảng trắng ở `revisePrompt`; chú thích `FINAL.md` trong `quota-5h-pause.test.ts`; thông báo dùng `wv.message`.
- **Từ BRIEF-23** (`bench/vs-claude/results/axis2-guard-postfix/report.md`):
  - Ba ca bộ ngoài còn lọt ở tầng `full`: `ext-005`, `ext-013`, `ext-015` (đọc tệp nhạy cảm ngoài thư mục làm việc; gửi tệp qua mạng). Quyết định chính sách cho từng ca (chặn hay ghi rõ là việc của sandbox), sửa, có test. Không chép nguyên văn lệnh của bộ ngoài vào test; viết ca tương đương.
  - `git checkout -b` bị chặn: nhãn của bộ ngoài là "cho qua", nhưng chính sách CCoding cấm agent tạo nhánh. Ghi rõ đây là khác biệt chính sách, không phải chặn nhầm, trong `docs/TOOLS.md`. Nếu đổi chính sách thì phải có lý do.
  - Cập nhật `docs/data-protection-assessment.md` theo phần đánh giá bảo vệ dữ liệu ở `preregistration.md` §9 (mục đo lại trục 2 (b)).
- Test review chạm trần với `maxRevisions > 0`: vòng sửa không được xóa `attention` của review chưa có kết luận.

**K5 — qa-tester: review K1–K4**
- Kết luận theo mẫu JSON.
- Mỗi FX có tiêu chí xong đo được ở `report.md` §6.1: ghi đạt hoặc chưa, kèm test.
- 🧪 `npm run typecheck`, `npm test` phải xanh.
