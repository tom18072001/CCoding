# Phòng Dev, gói D29: agent không được diệt tiến trình theo tên; nhiệm vụ mồ côi sau khi server dừng; cổng kế hoạch đọc nhầm chữ "chờ"

**Gói vừa: 3 hạng mục. Ngân sách 5M token.** Giao 15/11/2026.

**Căn cứ:**
- **Sự cố 15/11, khoảng 15:29 UTC, máy văn phòng.**
  - Lúc D28b (T-20261115-211946-3fc, S2 `senior-swe`) chạy hai vòng lặp `npm test` song song trong `.scratch/`, mọi tiến trình `node.exe` trên máy cùng chết một lúc: server văn phòng (cổng 7430), tiến trình `claude` của lượt gọi, và các lượt `npm test` (lần 4 của cả hai vòng đều bị cắt ngang).
  - Các vòng `bash` vẫn chạy tiếp tới 15:44. Kiểu này khớp với một lệnh diệt theo tên ảnh (`taskkill /F /IM node.exe`, `Stop-Process -Name node`…), không khớp với diệt theo cây tiến trình.
  - Không có nhật ký lệnh để xác nhận, vì lượt gọi chết cùng server. Event Log của Windows không ghi sự cố nào của `node`.
  - Văn phòng dừng khoảng 70 phút, tới khi người điều phối phát hiện và khởi động lại.
  - Người điều phối đã thêm tạm `denyCommands` cho hai dự án văn phòng (6 mẫu: `taskkill … /IM|/FI`, `Stop-Process -Name`, `Get-Process … | Stop-Process`, `killall`/`pkill`, `wmic process … delete|terminate`, `kill -1`). Việc này chưa có trong mặc định của sản phẩm.
- **Nhiệm vụ mồ côi.** Sau khi server khởi động lại, D28b vẫn ở `running`, S2 vẫn `running`, không có sự kiện nào. Phải hủy rồi tiếp tục bằng API mới chạy lại được. `resume` chỉ nhận `paused`, `failed`, `cancelled` (`src/orchestrator.ts`, hàm `resume`).
- **Cổng kế hoạch đọc nhầm chữ "chờ".** `briefItems` (`src/plan-gate.ts`, `SKIP_RE`) coi tiêu đề hạng mục có chữ "chờ" **ở bất kỳ đâu** là hạng mục hoãn (`exempt`), nên cổng không đòi kế hoạch phủ hạng mục đó. Gặp ở BRIEF-D28b lần soạn đầu (tiêu đề "đóng handle có chờ sự kiện"). Khi soạn chính đề bài này, `BELOW_SKIP_RE` còn coi dòng thân "- Không làm hỏng nhiệm vụ…" là hạng mục hoãn. Người điều phối bắt được cả hai bằng tay. Cùng loại lỗi với phủ định ở D25.

**Phạm vi:**
- **Được sửa:** `src/tools/workspace.ts` (`DEFAULT_DENY`), `src/tools/claude-guard.ts` (chỉ nếu cần áp mẫu mới cho Bash của `claude-cli`), `src/orchestrator.ts`, `src/store.ts` hoặc nơi nạp nhiệm vụ lúc khởi động, `src/plan-gate.ts`, `scripts/lint/rules/brief-lint.mjs` (chỉ nếu cần), `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật. Test **không** được diệt tiến trình theo tên trên máy chạy test.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: cấm diệt tiến trình theo tên trong mặc định của sản phẩm**
- Thêm vào `DEFAULT_DENY` các mẫu cấm diệt tiến trình theo tên ảnh hoặc bộ lọc, hay diệt mọi tiến trình:
  - `taskkill` với `/IM` hay `/FI`;
  - `Stop-Process -Name`/`-ProcessName`, `Get-Process … | Stop-Process`;
  - `killall`, `pkill`, `wmic process … delete|terminate`, `kill -1`.
- **Vẫn cho phép** diệt theo PID cụ thể (`taskkill /PID n /T /F`, `kill n`, `Stop-Process -Id n`).
- Lý do ghi trong thông báo chặn (tiếng Việt): diệt theo tên có thể giết server CCoding và tiến trình của agent khác; dùng PID của tiến trình mình đã chạy.
- Áp cho cả vòng công cụ của CCoding và hook của `claude-cli` (`CCODING_GUARD`).
- **Test:** mỗi mẫu cấm có ca dương; các lệnh diệt theo PID và các lệnh vô hại có chữ "kill" (vd. `git log --grep=kill`) là ca âm.
- `docs/` (chính sách lệnh): thêm nhóm này và căn cứ.

**K2 — backend-dev: nhiệm vụ mồ côi khi server dừng giữa chừng; `SKIP_RE` của cổng kế hoạch**
- **Khi server khởi động:** nhiệm vụ đang `running` hoặc `queued` từ tiến trình server trước được chuyển sang `paused`, với lý do rõ ràng (vd. "server dừng giữa chừng"). Hạng mục đang `running` về `pending`. Ghi một sự kiện nhật ký.
- **Không tự chạy lại.** Người dùng hoặc người điều phối bấm "Tiếp tục" như với nhiệm vụ tạm dừng.
- Nhiệm vụ đang chạy thật của **chính** tiến trình hiện tại phải giữ nguyên; nêu cách phân biệt (vd. mã phiên của tiến trình server ghi trên nhiệm vụ).
- **Test:** dựng store có nhiệm vụ `running`, khởi động app ⇒ nhiệm vụ thành `paused`, hạng mục `running` về `pending`, `resume` chạy được; nhiệm vụ `done`/`failed` không đổi.
- **`SKIP_RE` và `BELOW_SKIP_RE` của `briefItems`:** hiện coi tiêu đề có chữ hoãn ở bất kỳ đâu, hay dòng thân mở đầu bằng "Không làm" (kể cả "Không làm hỏng…"), là hạng mục hoãn. Chỉ coi là hoãn khi chữ hoãn là **nhãn**: đứng đầu phần sau mã K hay đầu dòng, và theo sau là dấu `:`, ngoặc hay hết dòng.
  - **Test:** "đóng handle có chờ sự kiện" ⇒ không hoãn; "- Không làm hỏng nhiệm vụ…" ⇒ không hoãn; "Chờ: dữ liệu từ Tom" ⇒ hoãn; "- Không làm (ngoài phạm vi)" ⇒ hoãn; test cũ giữ nguyên kỳ vọng.

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - bỏ một mẫu khỏi `DEFAULT_DENY` ⇒ test K1 đỏ;
  - bỏ bước chuyển `running` → `paused` lúc khởi động ⇒ test K2 đỏ;
  - trả `SKIP_RE`, `BELOW_SKIP_RE` về như cũ ⇒ test của K2 đỏ.
