# Phòng Nghiên cứu, gói 19b: E7b chạy xen kẽ trong một tiến trình; script và RUNBOOK làm đúng mọi luật đã khóa

**Gói vừa: 4 hạng mục. Ngân sách 6M token.** Giao 15/11/2026. Việc nối của BRIEF-26 (T-20261115-094542-2d1): làm tiếp trên nhánh `ccoding/t-20261115-094542-2d1`.

**Căn cứ:** biên bản CTO của BRIEF-26. Chưa nghiệm thu; review cuối là Sửa lớn.
- **Script và RUNBOOK chưa làm theo phụ lục §9 (P3, P4, P5).** Script có thể cho nhánh A trong khi §9 bắt buộc nhánh F. Còn thiếu:
  - P3: `authSource` của lượt `accept`;
  - P4: ngưỡng cặp thiếu theo arm và độ nhạy S3;
  - P5: nhãn "chưa kết luận" khi hai phép khác chiều.
- **RUNBOOK còn lượt thử R3** (dòng 55, 63, 82), trái với quyết định không chạy lại R3. Dòng 15 và 110 còn lệch phụ lục.
- **`paper.md` và `CHANGELOG.md`:** chỗ dẫn "§9, mục 'Có chạy lại R3'" cần rà (minor 10 của review).
- **Người điều phối đã kiểm, không cần làm lại:**
  - `SHA256SUMS` khớp hai tệp cấu hình (tính trên blob git, LF): `91cc507d…` và `3f62d742…`. Hai tệp chỉ có `defaults.acceptFollowupRounds` và `phases.toolTurns.accept`; không có khóa hay đường dẫn máy.
  - `preregistration.lock.json` chỉ thêm 8 dòng, không sửa hay xóa khối cũ.
- **Người điều phối đọc mã về đe dọa trần token ở P2:**
  - `phases.toolInputBudget` chỉ được áp ở runtime `api`: `maxInputTokens` truyền ở `src/orchestrator.ts` (khoảng dòng 3877), chỉ đọc ở `src/runtimes/api.ts:378`.
  - Runtime `claude-cli`, runtime E7b dùng, chỉ nhận `--max-turns` (`src/runtimes/claude-cli.ts`, khoảng dòng 275), và `capped` của nó chỉ có giá trị `'turns'` (khoảng dòng 393).
  - Đe dọa "trần token cắt R2b trước 16 lượt" vì vậy không áp cho E7b. Cần tự đọc lại và đính chính.
- **Phòng Dev đang làm D24 (song song)** để harness nhận cấu hình theo arm. Đây là "phương án thay thế" đã có sẵn ở §9 (c). Giao diện D24 **cố định**, viết RUNBOOK và script theo đúng tên sau:
  - `run.mjs --arm-config R1=<tệp>,R2=<tệp>`: mỗi arm CCoding một app riêng nạp tệp của arm, dữ liệu app ở `<--ccoding-data>/w1` và `/w2`; xen kẽ bảng Latin trong **một** tiến trình. Dòng `runs.jsonl` ghi `extraConfigSha256` là sha256 tệp của chính arm.
  - `run.mjs --selected <tệp>`: dùng danh sách chốt từ tệp, không chạy bước 1, không tạo `selected.json` trong `--out`.
  - **Trường mới trên dòng R1/R2**, từ các lượt `phase === 'accept'` của `calls.jsonl`:
    - `acceptCalls` (số lượt);
    - `acceptAuthSources` (mảng giá trị khác nhau);
    - `acceptTurnCapped` (boolean);
    - `acceptToolCalls` (tổng);
    - `acceptTurns` (tổng `num_turns`, hoặc `null` nếu có lượt thiếu).
  - Mã arm trên dòng vẫn là `R1`, `R2` (tương ứng `R1b`, `R2b`).
- **E7b chỉ chạy khi D24 và gói này đều đã gộp,** trên một bản ghim chứa cả hai.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e7b-cto/` (chỉ tệp đăng ký, RUNBOOK, cấu hình; chưa có dữ liệu chạy).
- **Không sửa:** `src/`, mã `bench/`.
- **Không chạy LLM để đo.**
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — @methodologist: phụ lục sai lệch E7b (2) và bảng quy tắc hiệu lực, trước mọi lượt gọi**

Khối mới ở §9, chỉ thêm, ghi rõ không có số E7b nào được xem khi viết.
- **Đổi sang phương án thay thế của (c):**
  - một tiến trình, `--arms R1,R2`, `--arm-config` với hai tệp đã khóa, `--selected` trỏ `results/e7-cto/selected.json`;
  - xen kẽ bảng Latin hai arm như E7;
  - lý do đổi;
  - bỏ phương án hai tiến trình, và đánh dấu các đe dọa (l) chỉ thuộc phương án đó là không còn áp dụng (không xóa câu cũ);
  - bản ghim phải chứa gộp D24; nếu không thì không chạy.
- **Nguồn kiểm theo trường dòng của D24:**
  - `capped` = `unread` và `acceptTurnCapped === true`; thiếu trường ⇒ "suy ra" như (e);
  - `authSource` theo `acceptAuthSources`. Khóa giá trị chấp nhận (phiên đăng nhập claude.ai của runtime `claude-cli`) và ghi nguồn mã của giá trị đó;
  - `acceptCalls` của mọi dòng `done` phải là 1 (vòng bổ sung tắt, P1);
  - phân bố `acceptTurns` theo arm chỉ để mô tả.
  - `calls.jsonl` trong thư mục dữ liệu app chỉ dùng để đối chiếu, không phải nguồn chính.
- **Đính chính P2 về `toolInputBudget`** theo căn cứ: tự đọc mã và dẫn tệp:dòng; giữ phần đọc `acceptTurnCapped` ở lượt thử.
- **Luật phân loại "hết giờ" cho S3 (P4):**
  - khóa theo trường và chuỗi lỗi mà harness và runtime thật sự ghi (vd. `quá hạn chờ` của `runCto`, `Hết thời gian` của runtime, bộ phân loại `timeout` ở `src/runtimes/errors.ts`);
  - viết thành luật tất định, kèm tệp:dòng;
  - không dựa vào nội dung kết luận.
- **Hành vi khi kiểm hạ tầng sai** (`authSource`, `maxTurns` khác 6/16, `acceptCalls` khác 1, `extraConfigSha256` sai): khóa rằng script **không in nhãn hay nhánh**, chỉ in lỗi kiểm.
- **Bảng "quy tắc hiệu lực":**
  - gom mọi quy tắc sau khối chính và hai phụ lục, mỗi dòng gồm: quy tắc, giá trị khóa, khối và mục nguồn;
  - bảng chỉ gom, không thêm quy tắc mới. Script và RUNBOOK dẫn theo bảng này.
- Thêm khối vào `preregistration.lock.json` bằng `node scripts/lint/prereg-lock.mjs --add-new`.

**K2 — data-scientist: script phân tích và RUNBOOK theo đúng bảng quy tắc hiệu lực**
- **`docs/research/analysis/e7b-analyze.mjs`:**
  - đọc **một** `runs.jsonl` (hai arm `R1`→`R1b`, `R2`→`R2b`); `--data` (thư mục dữ liệu app) là tùy chọn, chỉ để đối chiếu;
  - làm đủ các luật:
    - P3: kiểm `acceptAuthSources`;
    - P4: đếm cặp thiếu theo arm, ngưỡng đưa về nhánh F, độ nhạy S3 với luật "hết giờ" của K1;
    - P5: nhãn ba giá trị;
    - các kiểm hạ tầng của K1, khi sai thì không in nhãn hay nhánh;
  - giữ: không in số khi chưa có dữ liệu thật hoặc dữ liệu chưa đủ.
- **Test có đáp án biết trước cho từng luật:** mỗi dòng của bảng quy tắc hiệu lực có ít nhất một test, ghi tên test cạnh dòng đó trong báo cáo.
  - Phải có ca: hai phép khác chiều ⇒ "chưa kết luận"; một arm 4 cặp thiếu ⇒ F; chênh 3 ⇒ F; `authSource` lạ ⇒ không in nhãn; cặp thiếu do hết giờ vào S3; `acceptTurnCapped` thiếu ⇒ "suy ra".
- **`bench/vs-claude/results/e7b-cto/RUNBOOK.md` viết lại theo một tiến trình:**
  - chuẩn bị;
  - lượt thử: một mục dự phòng, `--arms R1,R2` trong một tiến trình, thư mục ngoài `e7b-cto/`. Kiểm `maxTurns` 6/16, `acceptCalls` = 1, `acceptAuthSources`, `models`, `promptSha` giống nhau. **Không có lượt R3**;
  - chạy chính một lệnh;
  - kiểm sau khi chạy;
  - phân tích.
  - Sửa chỗ lệch ở dòng 15, 110 cũ. Mục "việc Dev" ghi là đã giao D24. Lệnh chạy được trên PowerShell.
- Không để tệp tạm hay patch trong cây làm việc; báo cáo liệt kê `git status`.

**K3 — academic-writer: bài và tài liệu**
- **`paper.md` §6.7:**
  - mô tả E7b chạy xen kẽ một tiến trình (vẫn "chưa chạy", không số);
  - sửa chỗ dẫn "Có chạy lại R3" về đúng mục §9 (d).
- **`facts.json`, `CHANGELOG.md`:** đồng bộ; CHANGELOG ghi phụ lục (2) và lý do đổi phương án.

**K4 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Đọc và đối chiếu:**
  - mỗi dòng của bảng quy tắc hiệu lực có mã thực hiện trong script và có test tương ứng, ghi tệp:dòng;
  - RUNBOOK không còn lượt R3, lệnh dùng đúng tên cờ và trường D24 như ở phần căn cứ;
  - `preregistration.md` chỉ thêm; khối mới ghi rõ trước khi chạy và không có số E7b;
  - đính chính P2 khớp mã (tệp:dòng);
  - câu cấm còn đủ, nhất là không gọi phương án cũ là "xen kẽ".
