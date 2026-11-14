# Phần thêm cho `improvement-backlog.md`: B-20 đến B-49 (BRIEF-22, K6)

> **Hướng dẫn chèn** (dành cho vai có công cụ sửa tệp; K6 chỉ có công cụ ghi đè cả tệp, mà `improvement-backlog.md` dài khoảng 165 KB, nên không ghi đè an toàn được):
> 1. Chèn **Khối A** ngay sau dòng 12 của `improvement-backlog.md` (dòng "Cập nhật R18 …"), tức trước dòng "Nguyên tắc của giám đốc …".
> 2. Chèn **Khối B** ngay trước dòng `## 1. Kiểm nhận định N1–N5 bằng CSV`. Khối này đứng sau §0.1.
> 3. Chèn **Khối C** ngay trước dòng `## 6. Quan hệ với đăng ký trước và các giới hạn`. Khối này đứng sau mục B-19 và dấu `---`.
> 4. Chỉ thêm dòng, không sửa dòng cũ. Kiểm bằng `git diff --numstat docs/research/improvement-backlog.md`: cột xóa phải bằng 0.
> 5. Sau khi chèn, xóa tệp này hoặc giữ làm bản đối chiếu; không để hai bản lệch nhau.
>
> Danh sách khớp `analysis/decisions/report.md` mục 6 (FX1–FX21 → B-20…B-40; TN1–TN9 → B-41…B-49). Mã lần cập nhật của backlog là **R19**, nối tiếp R18. FX/TN là mã mục trong report, không phải mã lần cập nhật. R1/R2/R3 trong B-42 là tên arm của E7.

---

## Khối A (dòng cập nhật ở đầu tệp)

> Cập nhật R19 (T-20261114-162216-35d, K6, @research-lead, 14/11/2026; BRIEF-22): thêm **§0.2** và **B-20…B-49** (§5) từ danh sách lỗi sửa được (FX1–FX21) và thí nghiệm (TN1–TN9) của `analysis/decisions/report.md` mục 6. Mỗi mục ghi bằng chứng, chỗ sửa, tiêu chí xong đo được, test hoặc chỉ số kiểm lại, và trạng thái. Trạng thái đọc bằng `git log` ngày 14/11/2026; mã tham chiếu commit `b146b87c` (`analysis/decisions/logic-map.md`). Hạng 1 và 2 của §0.1 (b) đã có commit sửa (`e2b6573c`, `a11abf45`); hạng 7 chuyển thành B-42.

---

## Khối B (§0.2)

### 0.2 Cập nhật BRIEF-22 (R19, 14/11/2026): lỗi sửa được và thí nghiệm từ bảng điểm từng agent

Nguồn: `analysis/decisions/report.md` mục 6. Số lấy từ `scorecard.md` và `effectiveness.md`, do `scorecard.mjs` sinh. Vị trí mã theo `logic-map.md` ở commit `b146b87c`.

**(a) Trạng thái các hạng của §0.1 (b) sau ngày 14/11**

| Hạng §0.1 (b) | Trạng thái mới | Căn cứ |
|---:|---|---|
| 1 (BRIEF-D15 K1) | đã làm (`e2b6573c`) | `git log` 14/11/2026 |
| 2 (`authSource`) | đã làm cho runtime `claude-cli` (`a11abf45`, `39b9f166`) | `git log` 14/11/2026 |
| 7 (đo lại CTO Opus) | chuyển thành **B-42** | `report.md` TN2 |
| 8 (chia việc theo khả năng chia) | gộp vào **B-41** (E9) | `preregistration.md` §9.x |

**(b) Mục mới B-20…B-49**

| Mã | Việc | Loại | Trạng thái 14/11/2026 | Trùng gói Dev | Report |
|---|---|---|---|---|---|
| B-20 | Cổng phủ kế hoạch kiểm hạng mục và vai bắt buộc của đề bài | sửa mã | đang sửa | D17 K1, D16b K4 | FX1 |
| B-21 | Lời nhắc `research-lead.md:51` có ngoại lệ khi đề bài giao hạng mục reviewer | sửa `agent.md` | chưa giao | — | FX2 |
| B-22 | Đề bài đòi review thì không bỏ review | sửa mã | đang sửa | D17 K2 | FX3 |
| B-23 | Review bị bỏ phải để dấu vết và attention | sửa mã | chưa giao | — | FX4 |
| B-24 | CTO chưa đạt: vòng bổ sung; nhiệm vụ `after` không tự chạy | sửa mã + lời nhắc | đang sửa một phần | D17 K3 (phần a) | FX5 |
| B-25 | Reviewer chạm trần lượt phải ra kết luận | sửa mã | đang sửa | D16b K2 | FX6 |
| B-26 | `outside-root-write` trên mọi đường chạy lệnh | sửa mã | đang sửa một phần | D16b K1, K3 (`run_command`) | FX7 |
| B-27 | Đầu ra bị cắt 27/112 lượt: chẩn đoán rồi sửa | chẩn đoán + cấu hình | chưa giao | — | FX8 |
| B-28 | Thao tác công cụ lỗi (`security`, `peer-reviewer`) | sửa `agent.md` | chưa giao | — | FX9 |
| B-29 | `data-scientist` đọc tệp bằng shell | sửa `agent.md` | chưa giao | — | FX10 |
| B-30 | KPI `no-sources` (`academic-writer`, `methodologist`) | `agent.md` hoặc `kpi.ts` | chưa giao | — | FX11 |
| B-31 | Gói Nghiên cứu ×2,2 ngân sách: chặn ở bước plan | lời nhắc + mã | chưa giao | — | FX12 |
| B-32 | Ước lượng có thời gian đường găng | sửa mã | chưa giao | — | FX13 |
| B-33 | Lời nhắc bóc tách nhất quán; "1–7" theo `MAX_SUBTASKS` | lời nhắc (lỗi vặt) | chưa giao | — | FX14 |
| B-34 | Giao người lạ không rơi về trưởng phòng | sửa mã | chưa giao | — | FX15 |
| B-35 | FINAL của trưởng phòng qua cổng mẫu | sửa mã (lỗi vặt) | chưa giao | — | FX16 |
| B-36 | KPI nhất quán; thêm dòng điều phối viên | sửa mã | chưa giao | — | FX17 |
| B-37 | Ghi đúng model trưởng phòng theo làn | tài liệu/hồ sơ (lỗi vặt) | chưa giao | — | FX18 |
| B-38 | Kiểm tự động `tệp:dòng` của `logic-map.md` | script Nghiên cứu | chưa giao | — | FX19 |
| B-39 | Kiểm tự động đường dẫn máy trong `docs/research/` | script Nghiên cứu | chưa giao | — | FX20 |
| B-40 | Ký số log (chuỗi băm chưa phải WORM/ký số) | mã + hạ tầng | chưa giao; một phần cần giám đốc | — | FX21 |
| B-41 | **E9**: chất lượng bóc tách, planner Sonnet/Opus/Haiku | thí nghiệm | đã đăng ký (§9.x), chưa chạy | — | TN1 |
| B-42 | E7-R2 đo lại với trần lượt cao hơn | thí nghiệm | chưa đăng ký | — | TN2 |
| B-43 | Độ đúng kết luận reviewer | thí nghiệm | chưa đăng ký | — | TN3 |
| B-44 | Độ đúng định tuyến (điều phối viên) | thí nghiệm | chưa đăng ký | — | TN4 |
| B-45 | Chọn làn bằng đếm regex: ma trận nhầm | thí nghiệm không LLM | chưa đặc tả | — | TN5 |
| B-46 | Phân rã vượt đường găng theo nguyên nhân | phân tích | chưa giao | — | TN6 |
| B-47 | Tách `acceptance-fail` theo agent | mã KPI + đo | chưa giao | — | TN7 |
| B-48 | Bench ghi đủ `lane`, `subtasksTimed`, `maxConcSubtasks` | đo | chờ đợt bench mới | — | TN8 |
| B-49 | **Chấm lại** sau khi Dev sửa xong | đo | chờ Dev | — | TN9 |

**Đã sửa, không mở mục:**
- F-E9: `c0e66fab`.
- F-E10: `e2b6573c`, `a11abf45`.
- F-M3: `d1903029`; phần kiểm tự động là B-39.

**Ngoài tầm, không mở mục:**
- F-E4: thuộc B-18, cần giám đốc đăng nhập WSL.
- F-E5: thuộc B-12.

---

## Khối C (§5, các mục B-20…B-49)

Quy ước chung cho Khối C:
- Vị trí `src/…` theo commit `b146b87c`.
- Ngưỡng ghi "(đề xuất)" là của trưởng phòng, chờ giám đốc duyệt.
- "Chấm lại" là B-49.
- Mọi mục sửa `src/` hay `agents/` thuộc Phòng Dev. Lệnh kiểm tra của dự án: `npm run typecheck`, `npm test`.

### B-20 — Cổng phủ kế hoạch kiểm hạng mục và vai bắt buộc (R19, BRIEF-22; FX1) — **đang sửa (D17 K1, D16b K4)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L1: `plan-gate.ts:42,136-145,158-178`; quy tắc A chỉ đếm tệp nguồn theo `SOURCE_EXT`. BRIEF-20 bỏ K4 (peer-reviewer) mà cổng vẫn đạt (biên bản người điều phối 14/11, 1/3 ca, [Mô tả]). Văn phòng phụ: độ phủ hạng mục 12/15, độ phủ vai 3/7, cổng chặn 0 lần (`scorecard.md` `leadCover`) |
| **Chỗ sửa** | `src/plan-gate.ts`, `test/` |
| **Tiêu chí xong** | Kế hoạch thiếu mã `K\d+` của đề bài, hoặc thiếu vai có trong roster ⇒ chặn với `rule: brief-item`. Hạng mục đề bài ghi "không làm" hoặc "chờ" ⇒ được miễn. Đề bài không có mã ⇒ hành vi không đổi |
| **Kiểm lại** | Test D17 K1 (3 ca) và D16b K4 (3 ca); chấm lại: độ phủ hạng mục và độ phủ vai = n/n |
| **Trạng thái** | `4b0437c8` chỉ thêm đề bài D17, chưa có commit mã |

### B-21 — Lời nhắc trưởng phòng không cấm hạng mục reviewer do đề bài giao (R19; FX2) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | `agents/research/research-lead.md:51` dặn không tạo hạng mục review cho `@peer-reviewer`, kể cả khi đề bài giao mã riêng cho vai này. Đây là một trong hai nguyên nhân của BRIEF-20 (L1) |
| **Chỗ sửa** | `agents/research/research-lead.md` (và câu tương ứng ở `agents/dev/dev-lead.md` nếu có). Đổi định dạng `agent.md` ⇒ cập nhật `docs/AGENTS-GUIDE.md`, `test/registry.test.ts` (AGENTS.md) |
| **Tiêu chí xong** | Câu có ngoại lệ "trừ khi đề bài giao hạng mục có mã cho vai reviewer"; `npm test` xanh |
| **Kiểm lại** | Chấm lại: mọi kế hoạch có đề bài nêu hạng mục reviewer đều có hạng mục giao reviewer (n/n) |
| **Trạng thái** | Chưa giao; D17 chỉ sửa mã |

### B-22 — Đề bài đòi review thì không được bỏ review (R19; FX3) — **đang sửa (D17 K2)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-E2: `orch:1860-1899`, `quality-gate.ts:84`; văn phòng phụ có 2/5 lượt phòng bỏ review; BRIEF-20 |
| **Chỗ sửa** | `src/quality-gate.ts`, `src/orchestrator.ts` |
| **Tiêu chí xong** | Đề bài có hạng mục review ⇒ khâu review luôn chạy; lý do ghi vào `gate.decision` |
| **Kiểm lại** | Test hai nhánh (D17 K2). Chấm lại: số lượt bỏ review khi đề bài đòi review = 0 |
| **Trạng thái** | Chưa có commit mã |

### B-23 — Review bị bỏ phải để dấu vết (R19; FX4) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L2(b): khi review tắt hoặc không có reviewer, và không có kết quả lệnh nào, `run.review` giữ `undefined`. Vì vậy không có cờ "cần xem" (`orch:1860-1892`, `orch:2020`) |
| **Chỗ sửa** | `src/orchestrator.ts` |
| **Tiêu chí xong** | Nhánh này gán `run.review = {skipped: true, reason}`, đặt `attention` "chưa review" và ghi log sự kiện riêng |
| **Kiểm lại** | Test orchestrator: `options.review=false`, không có `checkCommands` ⇒ `run.review.skipped === true` và có `attention` |
| **Trạng thái** | Chưa giao; ngoài phạm vi D17 K2, vì K2 chỉ xử lý ca đề bài đòi review |

### B-24 — CTO chưa đạt thì không đóng như đã xong (R19; FX5) — **đang sửa một phần (D17 K3)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L3: `orch:1088-1094` đặt `status='done'` sau `accept()` bất kể kết quả; `orch:876-882` cho nhiệm vụ `after` chạy tiếp. BRIEF-20: 3/9 tiêu chí chưa đạt mà vẫn "hoàn thành, cần xem". Văn phòng phụ: 1/5 lượt phòng được nghiệm thu |
| **Chỗ sửa** | (a) Vòng bổ sung: lời nhắc nghiệm thu, `parseAcceptance`, `src/orchestrator.ts` (D17 K3). (b) Chặn `after`: `src/orchestrator.ts` (`waitingOn`) |
| **Tiêu chí xong** | (a) Tiêu chí "trong phạm vi" mở tối đa 1 vòng bổ sung. (b) Hết vòng mà vẫn chưa đạt ⇒ nhiệm vụ `after` giữ chờ, hoặc nhiệm vụ mang trạng thái riêng (ví dụ `needs_review`) |
| **Kiểm lại** | 4 test D17 K3, cộng 1 test: nhiệm vụ trước có `accepted=false, parsed=true` ⇒ nhiệm vụ `after` không chạy. Chấm lại: tỉ lệ lượt phòng được nghiệm thu (hiện 1/5) |
| **Trạng thái** | (a) đang sửa (D17); (b) chưa giao |

### B-25 — Reviewer chạm trần lượt phải ra kết luận (R19; FX6) — **đang sửa (D16b K2)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L4: `claude-cli.ts:238,389` trả `capped:'turns'` không kèm `error`; pha review không đọc `capped` (`orch:1915`); `CONTINUE_PHASES` không có `review` (`orch:124`). BRIEF-D16. KPI: `peer-reviewer` bị cắt 4/5, `qa-tester` 4/9, `reviewUnparsed` 1 |
| **Chỗ sửa** | `src/orchestrator.ts`, `src/runtimes/claude-cli.ts` |
| **Tiêu chí xong** | Ba nhánh: lượt tiếp nối chỉ để trả JSON; vẫn không đọc được thì chạy lại với trần lượt cao hơn; vẫn không được thì attention rõ ràng |
| **Kiểm lại** | 3 test D16b K2. Chấm lại: `reviewUnparsed` = 0; số lượt reviewer bị cắt ≤ 2/14 (đề xuất; hiện 8/14) |
| **Trạng thái** | Chưa có commit mã |

### B-26 — Rule `outside-root-write` trên mọi đường chạy lệnh (R19; FX7) — **đang sửa một phần (D16b K1, K3)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L5: rule chỉ được gọi ở `claude-guard.ts:110`. Chưa áp ở `workspace.ts:604-612` (`run_command`), `workspace.ts:700` (`runCheckCommand`), `cli-agents.ts`. Rule thêm ở `ce8f217b`/`de4b78fc` |
| **Chỗ sửa** | `src/tools/workspace.ts`, `src/runtimes/cli-agents.ts`, `src/tools/shell-policy.ts` |
| **Tiêu chí xong** | Cùng một bảng lệnh cho cùng quyết định qua mọi đường; ≥ 20 lệnh dev thường gặp không bị chặn nhầm |
| **Kiểm lại** | Test bảng lệnh (D16b K1, K3), mở rộng cho `runCheckCommand` và codex/kimi |
| **Trạng thái** | `run_command` đang sửa (D16b); `runCheckCommand` và `cli-agents` chưa giao |

### B-27 — Đầu ra bị cắt ở 10/14 agent (R19; FX8) — **chưa giao; chẩn đoán trước**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A1: 27/112 lượt gọi bị cắt (`kpi-office.json` → `truncated`). Cấu hình vòng công cụ: `ccoding.config.json:35`, `src/config.ts:379` |
| **Chỗ sửa** | Bước 1: bảng nguyên nhân theo pha từ log (chạm trần lượt hay trần token đầu ra). Bước 2: `src/config.ts` (`phases.toolTurns`) hoặc lời nhắc "ghi sớm" |
| **Tiêu chí xong** | Có bảng nguyên nhân. Sau sửa, tỉ lệ bị cắt ≤ 10 % lượt gọi trên KPI 30 ngày (đề xuất; hiện 24,1 %) |
| **Kiểm lại** | `scorecard.mjs` trên `kpi-office.json` mới, cột "Bị cắt" |
| **Trạng thái** | Chưa giao |

### B-28 — Thao tác công cụ lỗi ở `security`, `peer-reviewer` (R19; FX9) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A3: KPI `tools-fail`, 22–25 % thao tác lỗi |
| **Chỗ sửa** | `agents/dev/security.md`, `agents/research/peer-reviewer.md` (bước dò môi trường và lệnh của repo) |
| **Tiêu chí xong** | Finding `tools-fail` không còn; tỉ lệ thao tác lỗi ≤ 10 % (đề xuất) |
| **Kiểm lại** | KPI mới; `test/registry.test.ts` |
| **Trạng thái** | Chưa giao |

### B-29 — `data-scientist` đọc tệp bằng shell (R19; FX10) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A4: 88 lệnh shell so với 24 lần dùng công cụ tệp |
| **Chỗ sửa** | `agents/research/data-scientist.md` |
| **Tiêu chí xong** | Finding `shell-reads` không còn; lệnh shell để đọc ít hơn số lần dùng công cụ tệp |
| **Kiểm lại** | KPI mới |
| **Trạng thái** | Chưa giao |

### B-30 — KPI `no-sources` (R19; FX11) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A5: `academic-writer`, `methodologist` có Tuân thủ 70 |
| **Chỗ sửa** | Trước hết xác định finding đúng hay quy tắc sai (hạng mục thiết kế có thể không cần nguồn ngoài), rồi sửa `agents/research/*.md` hoặc miễn trong `src/kpi.ts` |
| **Tiêu chí xong** | Finding không còn ở hạng mục có yêu cầu nguồn; hoặc `src/kpi.ts` miễn cho hạng mục không yêu cầu nguồn, kèm test |
| **Kiểm lại** | KPI mới; test `kpi` |
| **Trạng thái** | Chưa giao |

### B-31 — Gói Nghiên cứu vượt ngân sách (R19; FX12) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A6: phòng dùng 52,17M token so với 24,00M ngân sách (×2,2, `kpi-office.json`) |
| **Chỗ sửa** | `agents/research/research-lead.md` (giới hạn cỡ gói, tách giai đoạn); `checkEstimate` ở bước plan (`orch:2630`) |
| **Tiêu chí xong** | Ước lượng kế hoạch > ngân sách ⇒ cảnh báo hoặc đề xuất tách trước khi chạy; finding `budget` không còn |
| **Kiểm lại** | Test `checkEstimate`; KPI mới |
| **Trạng thái** | Chưa giao |

### B-32 — Ước lượng có thời gian đường găng (R19; FX13) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L11: `estimatePlan` chỉ cộng token (`orch:2356-2383`, `src/estimate.ts:15-42`) |
| **Chỗ sửa** | `src/estimate.ts` |
| **Tiêu chí xong** | Trả thêm `criticalPathEstimate` và `parallelism` dự kiến (work/cp) |
| **Kiểm lại** | Test đơn vị trên kế hoạch mẫu; khi chấm lại, so số dự kiến với `decomp-metrics.mjs` |
| **Trạng thái** | Chưa giao |

### B-33 — Lời nhắc bóc tách nhất quán (R19; FX14) — **chưa giao; lỗi vặt**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L8: `planPrompt` bảo tối đa song song; `dev-lead.md:57` bảo ít hạng mục lớn; `FAST_LANE_PLAN` bảo chia 2–4; lời nhắc ghi "1–7" (`prompts.ts:313`) trong khi `MAX_SUBTASKS = 8` (`planner.ts:25`) |
| **Chỗ sửa** | `src/prompts.ts`, `agents/dev/dev-lead.md` |
| **Tiêu chí xong** | Một quy tắc theo làn; số trong lời nhắc lấy từ hằng `MAX_SUBTASKS` |
| **Kiểm lại** | Test: chuỗi lời nhắc chứa đúng giá trị `MAX_SUBTASKS`; `npm test` |
| **Trạng thái** | Chưa giao |

### B-34 — Giao người lạ không rơi về trưởng phòng (R19; FX15) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L9: `matchAssignee(...) ?? lead` (`planner.ts:114`); trưởng phòng không có `Bash` |
| **Chỗ sửa** | `src/planner.ts`, `src/plan-gate.ts` (quy tắc B) |
| **Tiêu chí xong** | Assignee lạ ⇒ cổng B báo; hạng mục cần chạy lệnh không giao cho agent không có `run_command` |
| **Kiểm lại** | Test `parsePlan`/`planGate` |
| **Trạng thái** | Chưa giao |

### B-35 — FINAL của trưởng phòng qua cổng mẫu (R19; FX16) — **chưa giao; lỗi vặt**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L12: `runQualityGate` chỉ kiểm hạng mục (`orch:3270-3277`, `quality-gate.ts:62`) |
| **Chỗ sửa** | `src/orchestrator.ts` |
| **Tiêu chí xong** | FINAL thiếu mục bắt buộc của mẫu ⇒ có cờ trong `gate.decision` |
| **Kiểm lại** | Test `templateGate` cho FINAL |
| **Trạng thái** | Chưa giao |

### B-36 — KPI nhất quán và có dòng cho điều phối viên (R19; FX17) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-M1: `tasksCounted` = 7 trong khi tổng `tasksByStatus` = 10; điều phối viên không có dòng trong `kpi-office.json` |
| **Chỗ sửa** | `src/kpi.ts` |
| **Tiêu chí xong** | Hai trường bằng nhau, hoặc tệp xuất ghi định nghĩa; có dòng cho điều phối viên (chi phí route, tỉ lệ lùi `keywordRoute`) |
| **Kiểm lại** | Test `kpi`; `scorecard.mjs --check` đọc được dòng mới |
| **Trạng thái** | Chưa giao |

### B-37 — Ghi đúng model trưởng phòng theo làn (R19; FX18) — **chưa giao; lỗi vặt**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | Hồ sơ `dev-lead`/`research-lead` ghi opus; ở làn nhanh pha `plan` chạy sonnet (`orch:1650`, `config.ts:405`), tức 252 lượt fast (`model-per-role.md` §2) |
| **Chỗ sửa** | `agents/dev/dev-lead.md`, `agents/research/research-lead.md`, `docs/AGENTS-GUIDE.md` |
| **Tiêu chí xong** | Tài liệu ghi model theo làn. Bài báo không còn câu "trưởng phòng dùng Opus" như quy tắc chung |
| **Kiểm lại** | `test/registry.test.ts`; thêm mục `stale` vào `facts.json` cho câu sai |
| **Trạng thái** | Chưa giao |

### B-38 — Kiểm tự động `tệp:dòng` của `logic-map.md` (R19; FX19) — **chưa giao (Phòng Nghiên cứu)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | `logic-map.md` gắn số dòng với `b146b87c`; K1 phải đối chiếu tay và còn một chỗ xấp xỉ (`orch:1165-1172`) |
| **Chỗ sửa** | Script mới `docs/research/scripts/logic-map-check.mjs` |
| **Tiêu chí xong** | Với mỗi tham chiếu `tệp:dòng` có tên ký hiệu đi kèm: kiểm dòng đó ở commit mốc (`git show <mốc>:<tệp>`) có chứa ký hiệu; báo số tham chiếu lệch so với `HEAD` |
| **Kiểm lại** | exit 0 trên `b146b87c`; exit 1 khi cố ý sửa một số dòng; thêm vào danh sách lệnh kiểm tra của dự án |
| **Trạng thái** | Chưa giao |

### B-39 — Kiểm tự động đường dẫn máy (R19; FX20) — **chưa giao (Phòng Nghiên cứu)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-M3: BRIEF-21 sót đường dẫn máy, đã che tay ở `d1903029` |
| **Chỗ sửa** | `docs/research/scripts/consistency-check.mjs` hoặc mục `stale` trong `facts.json` |
| **Tiêu chí xong** | Đường dẫn tuyệt đối dạng ổ đĩa Windows hoặc thư mục home trong `docs/research/**` ⇒ exit 1 |
| **Kiểm lại** | Tệp tạm có đường dẫn giả ⇒ exit 1; repo hiện tại ⇒ exit 0 |
| **Trạng thái** | Chưa giao |

### B-40 — Ký số log (R19; FX21) — **chưa giao; một phần cần giám đốc**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L13: chuỗi băm ở `logger.ts:66-72` phát hiện sửa nhưng không ký số, không WORM; AGENTS.md đòi log làm chứng cứ phải bất biến |
| **Chỗ sửa** | `src/logger.ts` (ký HMAC theo đoạn); lưu trữ WORM là việc hạ tầng |
| **Tiêu chí xong** | Mỗi đoạn log có chữ ký kiểm được; `chainChecker` báo lỗi khi sửa một dòng |
| **Kiểm lại** | Test `logger`; giám đốc chọn hạ tầng lưu trữ |
| **Trạng thái** | Chưa giao |

### B-41 — E9: chất lượng bóc tách và planner mạnh (R19; TN1) — **đã đăng ký, chưa chạy**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-E7: P có 10/56 lượt với hạng mục dài nhất > 50 %. F-E8: làm lại trung vị 22,5 %. Không có thước đo chất lượng bóc tách (`effectiveness.md` 3e) |
| **Thiết kế** | `preregistration.md` §9.x: 32 bài chia được + 32 bài không chia được; giai đoạn 1 chỉ lập kế hoạch, 3 arm (Sonnet/Opus/Haiku) × 3 lặp = 576 lượt plan; H1 độ phủ, H2 chia thừa, Holm |
| **Tiêu chí xong** | Có kết quả H1/H2 theo đăng ký; quyết định giữ hay đổi `phaseModels.plan` |
| **Kiểm lại** | Độ phủ, tỉ lệ chia thừa; κ giữa hai người gán ≥ 0,6 |
| **Điều kiện** | Giám đốc duyệt ngân sách token và hai người gán chuẩn; đủ 64 bài chuẩn |

### B-42 — E7-R2 đo lại với trần lượt cao hơn (R19; TN2; thay hạng 7 §0.1 (b)) — **chưa đăng ký**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A9: arm R1 chặn nhầm 42,2 %; arm R2 (Opus) 6,3 % nhưng recall 85,9 % và 13 lượt không đọc được do trần 6 lượt (`e7-cto/report.md`) |
| **Thiết kế** | Đăng ký §9 trước lượt đầu; cùng 128 mục E7; trần lượt cao hơn, giống nhau mọi arm |
| **Tiêu chí xong** | Arm R2 có 0 lượt không đọc được do trần; recall và chặn nhầm có CI |
| **Kiểm lại** | recall, chặn nhầm, USD |
| **Điều kiện** | Chạy sau B-25; giám đốc duyệt chi phí Opus |

### B-43 — Độ đúng kết luận reviewer (R19; TN3) — **chưa đăng ký**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | `scorecard.md` 1b: chưa có số về độ đúng; bench có `review` = 0 ở mọi lượt có `lane` |
| **Thiết kế** | Bộ review có đáp án (mở rộng bộ lỗi cài B-12), cùng trần lượt, sonnet so với opus |
| **Tiêu chí xong** | Có recall và chặn nhầm của reviewer trên ≥ 64 mục mỗi phía |
| **Kiểm lại** | recall, chặn nhầm |
| **Điều kiện** | Chạy sau B-25 |

### B-44 — Độ đúng định tuyến (R19; TN4) — **chưa đăng ký**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | Điều phối viên không có KPI. Chi phí route đã đo (3,7 % token), độ đúng chưa đo (`model-per-role.md`) |
| **Thiết kế** | Bộ nhãn phòng đúng do người gán; phát lại khâu `route` với haiku và sonnet, không chạy nhiệm vụ |
| **Tiêu chí xong** | Tỉ lệ định tuyến đúng có CI cho hai model |
| **Kiểm lại** | tỉ lệ đúng, tỉ lệ lùi `keywordRoute` |
| **Điều kiện** | Có người gán nhãn |

### B-45 — Chọn làn bằng đếm regex (R19; TN5) — **chưa đặc tả**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | L10: `countParts` đếm mục danh sách cấp cao nhất (`lane.ts:55-75,99-107`) |
| **Thiết kế** | Phát lại `chooseLane` (mã thuần, không LLM) trên tập đề bài đã gán làn đúng; đối chiếu `lane` với `score` và `fixRounds` trong `runs.jsonl` |
| **Tiêu chí xong** | Có ma trận nhầm làn; đếm số đề bị tính thừa "phần" |
| **Kiểm lại** | tỉ lệ nhầm làn |
| **Điều kiện** | Không tốn hạn mức LLM |

### B-46 — Phân rã vượt đường găng theo nguyên nhân (R19; TN6) — **chưa giao (Phòng Nghiên cứu)**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | P/dev vượt đường găng 8,1 % (q3 23,3 %); L6 (một hạng mục mỗi người nhận), L7 (không có worktree thì chạy độc quyền); F-E6: xung đột gộp 6/213 |
| **Thiết kế** | Thêm vào `decomp-metrics.mjs`: thời gian chờ người nhận bận, chờ gộp, setup worktree, chạy độc quyền |
| **Tiêu chí xong** | Bảng tỉ trọng nguyên nhân trên ≥ 35 lượt Dev |
| **Kiểm lại** | vượt đường găng theo nguyên nhân |
| **Điều kiện** | Dữ liệu từng lượt nằm ngoài repo; chỉ đưa số tổng hợp vào repo |

### B-47 — Tách `acceptance-fail` theo agent (R19; TN7) — **chưa giao**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-A2: KPI gán tiêu chí trượt cho mọi người thực thi và trưởng phòng của nhiệm vụ |
| **Thiết kế** | `src/kpi.ts` gán tiêu chí cho hạng mục và agent theo deliverable và `dependsOn`, rồi tính lại |
| **Tiêu chí xong** | `acceptance-fail` tách theo agent |
| **Kiểm lại** | KPI `outcome` theo agent; test `kpi` |
| **Điều kiện** | — |

### B-48 — Bench ghi đủ trường chia việc (R19; TN8) — **chờ đợt bench mới**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | F-M2: chỉ 36/632 lượt CCoding có `subtasksTimed` |
| **Thiết kế** | Mọi arm CCoding ở đợt mới ghi `lane`, `subtasksTimed`, `maxConcSubtasks` |
| **Tiêu chí xong** | 100 % lượt CCoding mới có đủ ba trường |
| **Kiểm lại** | Đếm trường trong `runs.jsonl` |
| **Điều kiện** | Giám đốc mở đợt bench |

### B-49 — Chấm lại sau khi Dev sửa xong (R19; TN9) — **chờ Dev**

| Trường | Nội dung |
|---|---|
| **Bằng chứng** | Bảng điểm hiện tại: `scorecard.md` (KPI 30 ngày tới 14/11/2026) |
| **Thiết kế** | `run-plan.md` §10.2: KPI 30 ngày mới, `decomp-metrics.mjs`, `scorecard.mjs --write/--check`, phát lại ba ca 14/11 bằng test không gọi LLM. F-A7 (`devops`, n=2) và F-E6 (xung đột gộp) đọc lại khi n đủ |
| **Tiêu chí xong** | Mỗi mục B-20…B-40 có tiêu chí xong đạt, hoặc ghi lý do chưa đạt |
| **Kiểm lại** | Các cột của `scorecard.md`; `scorecard.mjs --check` exit 0 |
| **Điều kiện** | Dev gộp xong D17, D16b và gói lỗi vặt |
