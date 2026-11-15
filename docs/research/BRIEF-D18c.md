# Phòng Dev, gói D18c: vòng bổ sung bị cổng kế hoạch chặn; lời nhắc lập kế hoạch chưa nêu mã hạng mục; nhãn lỗi sai; phần còn lại của D18b

**Gói vừa: 5 hạng mục. Ngân sách 10M token.** Giao 14/11/2026, sau khi D18a gộp.

**Căn cứ:** lần chạy thật đầu tiên trên bản mã có D17 (văn phòng phụ, từ 14/11 20:50 +07), cùng biên bản nghiệm thu của CTO cho D18b.

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`), `agents/` (đổi định dạng thì cập nhật `docs/AGENTS-GUIDE.md` và `test/registry.test.ts`).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

## Hạng mục

**K1 — backend-dev: kế hoạch của vòng bổ sung phải được kiểm theo các tiêu chí của vòng đó, không theo toàn đề bài (lỗi nặng của D17)**
- **Ca thật (D18b):**
  - CTO chưa nghiệm thu; CCoding mở vòng bổ sung 1/1 cho 1 tiêu chí trong phạm vi.
  - Kế hoạch bổ sung có 2 hạng mục đúng việc (`test/fixtures/brief-item/plan-d18b-followup.json`).
  - Cổng phủ kế hoạch kiểm nó như kế hoạch của toàn đề bài: rule A đòi mọi tệp đề bài nêu, `brief-item` đòi K1–K5. Kết quả: chặn, sửa kế hoạch vẫn chặn, nhiệm vụ `failed`.
  - Hệ quả: hiện mọi vòng bổ sung đều sẽ hỏng.
- **Sửa.** Với kế hoạch có `followupOf`/`round`:
  - rule A và `brief-item` chỉ áp lên phần đề bài mà các tiêu chí của vòng bổ sung trỏ tới (mã K có trong tiêu chí, nếu có);
  - không có mã thì bỏ hai rule đó, chỉ giữ kiểm đọc được;
  - ghi rõ trong log.
- **Test:**
  - fixture D18b ⇒ đạt;
  - vòng bổ sung có tiêu chí nêu "K4", kế hoạch thiếu K4 ⇒ chặn;
  - kế hoạch thường không đổi hành vi.

**K2 — backend-dev: lời nhắc lập và sửa kế hoạch phải nêu mã hạng mục và vai bắt buộc; nhãn lỗi đúng**
- **Ca thật (BRIEF-22b lần đầu):**
  - Kế hoạch của trưởng phòng Nghiên cứu làm đủ việc nhưng đặt tiêu đề theo mã phát hiện (C1, M1–M5…), không ghi K1/K2 (`plan-brief22b-first.json`). Cổng chặn K1, K2 (cùng K4 đúng là thiếu).
  - Lời nhắc sửa kế hoạch không nói phải ghi mã, nên sửa vẫn chặn.
  - Attention ghi `plan-unreadable` với thông báo "Kế hoạch … đọc dở:  — chưa chạy hạng mục nào" (lý do rỗng). Sai: kế hoạch đọc được, bị chặn vì hạng mục đề bài.
- **Sửa:**
  - lời nhắc lập kế hoạch (`planPrompt` và lời nhắc làn nhanh) liệt kê các mã hạng mục của đề bài (`briefItems`) và vai review bắt buộc, yêu cầu ghi mã ở đầu tiêu đề hạng mục;
  - lời nhắc sửa kế hoạch đưa nguyên văn lý do của cổng;
  - attention riêng (vd. `plan-brief-items`), thông báo nêu mã thiếu.
- **Test:**
  - chuỗi lời nhắc có danh sách mã;
  - thông báo và attention đúng loại, không rỗng;
  - `briefItems` nhận dòng `**K2 — data-scientist: …**` như hiện nay.

**K3 — security: `chainChecker` chế độ bắt buộc ký; dọn minor của D18b**
- Khi có khóa HMAC, hoặc có cờ `--require-signed`: dòng thiếu `sig` là lỗi. Ca cần bắt: kẻ sửa log gỡ hết `sig` rồi tính lại băm.
- Test cho cả hai chế độ.
- Dọn JSDoc `FAST_LANE_PLAN` (minor 1 của D18b).

**K4 — senior-swe: orchestrator ghi `turnCapped` và `stop_reason` vào bản ghi lượt; KPI thôi dựa vào `diag`**
- Bản ghi lượt (`calls.jsonl`) có:
  - `turnCapped: boolean`;
  - `stopReason`, khi runtime trả về.
- `src/kpi.ts` dùng hai trường này. Bản ghi cũ không có trường thì lùi về cách cũ. Test.
- Kiểm `estimatePlan` có ước lượng thấp cho gói Nghiên cứu không:
  - so ước lượng với token thật của BRIEF-20/21/22/23 (dùng số tổng trong `bench/vs-claude/results/decisions/kpi-office.json`, không cần dữ liệu từng lượt);
  - ghi bảng vào `docs/diagnostics/`;
  - lệch hệ thống thì chỉnh hệ số, có test.

**K5 — qa-tester: review K1–K4**
- Kết luận theo mẫu JSON. Kiểm riêng: vòng bổ sung trên fixture D18b đi hết luồng (runtime giả) tới nghiệm thu lại.
- 🧪 `npm run typecheck`, `npm test` phải xanh.
