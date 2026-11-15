# Phòng Dev, gói D21: lượt hết giờ không làm dừng cả văn phòng; luật A bớt đích giả; hiệu chỉnh lại ước lượng

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 15/11/2026.

**Căn cứ** (số đếm trên văn phòng phụ, 21 nhiệm vụ, 12–15/11):
- **Lượt hết giờ bị xếp là hết hạn mức.**
  - Có 5 lượt `claude-cli` lỗi `[timeout] Hết thời gian (1800s)`, kéo theo 14 lần `task.paused` với lý do `quota`, ở 9 nhiệm vụ.
  - Một lượt hết giờ đánh dấu runtime "tạm ngừng" nên **mọi** nhiệm vụ đang chạy cùng dừng. Vd. 14/11 16:15Z ba nhiệm vụ dừng cùng lúc.
  - D19 bị dừng và tiếp tục 6 lần. Một lượt sửa của D19 đã commit xong việc ngay trước khi hết giờ, rồi vẫn bị tính là lỗi.
- **Thời lượng lượt gọi đã xong** (giây, theo pha):

  | Pha | n | p50 | p90 | max |
  |---|---|---|---|---|
  | `execute` | 107 | 262 | 688 | 1393 |
  | `revise` | 25 | 99 | 266 | 1291 |
  | `review` | 23 | 91 | 196 | 1620 |

  Lượt hết giờ không có trong `calls.jsonl`, nên phần đuôi trên 1800 s không thấy trong bảng.
- **Luật A của cổng kế hoạch lấy đích giả.** Tệp mà đề bài chỉ nhắc như đối tượng của một rule bị coi là đích phải có người nhận, nên buộc một lượt sửa kế hoạch bằng Opus.
  - Vd. D20 nhắc `src/registry.ts` và `test/registry.test.ts` trong mô tả rule `agent-format-cochange`.
  - Kế hoạch thật: `test/fixtures/brief-item/plan-d20-split.json`; `planGate` ra `A: chưa có hạng mục nhận src/registry.ts, test/registry.test.ts`.
- **`runtimeFactor` của `claude-cli` = 5** (D18d) dựa trên n = 1. Nay đã có thêm nhiều gói chạy xong dưới `claude-cli` (D18d, D19, D20, BRIEF-22c, BRIEF-22d…).

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`), `bench/vs-claude/results/decisions/estimate-vs-actual.json` (chỉ thêm dòng).
- Không chạy benchmark, không gọi `claude -p` thật; test bằng runtime giả.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

## Hạng mục

**K1 — backend-dev: hết giờ khác hết hạn mức**
- Phân loại lỗi runtime tách `timeout` khỏi `quota`/`rate-limit`.
  - **`timeout`:** không đánh dấu runtime tạm ngừng, không dừng nhiệm vụ khác.
  - **Lượt hết giờ:** thử lại một lần cho riêng lượt đó. Lượt `execute`/`revise` thì nối từ trạng thái worktree hiện có: commit đã có giữ nguyên, lời nhắc nêu rõ việc đã làm. Hết giờ lần hai thì hạng mục đó lỗi, nhiệm vụ khác không bị ảnh hưởng.
  - **Chỉ lỗi hạn mức thật** (thông báo giới hạn của nhà cung cấp, 429 kèm thời điểm) mới tạm ngừng runtime như cũ.
- Trần thời gian lượt gọi cấu hình được theo pha. Đề xuất mặc định dựa trên bảng trên, kèm lý do. Ghi vào `docs/RUNTIMES.md`.
- Ghi lượt hết giờ vào `calls.jsonl` (`stopReason: 'timeout'`, thời lượng), để phần đuôi đo được.
- **Test bằng runtime giả:**
  - lượt hết giờ ⇒ nhiệm vụ khác vẫn chạy;
  - hết giờ lần đầu rồi xong ⇒ hạng mục `done`;
  - hết giờ hai lần ⇒ hạng mục lỗi, runtime không bị đánh dấu.

**K2 — senior-swe: luật A chỉ lấy đích thật**
- Phân biệt tệp đề bài **giao sửa** với tệp chỉ được **nhắc tới**. Cách làm do phòng chọn và ghi lý do, vd.:
  - theo mục "Được sửa" và động từ sửa trong hạng mục;
  - hoặc chỉ tính tệp nêu ở dòng hạng mục, không tính tệp trong ví dụ hay mô tả rule.
- **Test bằng kế hoạch thật:**
  - `plan-d20-split.json` với `BRIEF-D20.md` không còn bị A;
  - các ca A đúng đã có (`plan-brief20.json`, `plan-brief22.json`, …) vẫn bị bắt.
  - Ghi số ca A trước và sau trên toàn bộ fixtures.

**K3 — senior-swe: hiệu chỉnh lại ước lượng**
- Thêm vào `estimate-vs-actual.json` mọi nhiệm vụ đã xong trên văn phòng phụ từ D18d: ước lượng lúc lập kế hoạch, token thật, runtime, làn, số hạng mục.
- Tính lại `runtimeFactor` (trung vị, khoảng tứ phân vị, n). Đổi giá trị mặc định chỉ khi n ≥ 5 và lệch hệ thống quá 1,5 lần; ngược lại giữ và ghi lý do.
- Cập nhật `docs/diagnostics/estimate-research.md`; có test.

**K4 — qa-tester: review**
- Kết luận theo mẫu JSON.
- **Kiểm sức bắt lỗi:**
  - bỏ phần tách `timeout` ⇒ test K1 phải đỏ;
  - bỏ phần lọc đích của K2 ⇒ test `plan-d20-split` phải đỏ.
- 🧪 `npm run typecheck`, `npm test`, `npm run test:bench` phải xanh. Có `npm run lint` (sau D20) thì cũng phải xanh.
