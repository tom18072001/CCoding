# Bảng điểm từng agent và chỗ fail (BRIEF-22, K2)

Phân loại dữ liệu: **Nội bộ**. Chỉ có chỉ số tổng hợp; dữ liệu vận hành thật ghi ẩn danh "dự án A" (và P1–P6 ở nhóm P), không có đề bài, tiêu đề, mã nhiệm vụ hay đường dẫn máy.
Nhãn: **[Mô tả]** = số quan sát, không đối chứng, không nhân quả. Mọi số trong các khối bảng do script sinh ra.

- Sinh lại bảng: `node docs/research/analysis/decisions/scorecard.mjs --write`
- Kiểm bảng trong md khớp đầu ra và đủ 14 agent: `node docs/research/analysis/decisions/scorecard.mjs --check`
- Nguồn: `bench/vs-claude/results/decisions/{kpi-office.json, decomp-agg.json, RUNLOG.md}`, `bench/vs-claude/results/p-parallel/RUNLOG.md`, `g-mutation/report.md`, `e7-cto/report.md`, `axis2-guard/results.json`, mọi `*/runs.jsonl` (cấu trúc kế hoạch tính bằng `decomp-metrics.mjs`).
- Phạm vi KPI: văn phòng phụ, 30 ngày tới 14/11/2026; nhiệm vụ đang chạy vẫn được tính nên điểm sẽ đổi khi chúng xong.

## Phân vai trong mã so với cách gọi "CTO" của giám đốc

| Việc | Ai làm trong mã | Dòng trong bảng điểm |
|---|---|---|
| Định tuyến nhiệm vụ | điều phối viên (`agents/orchestrator.md`); khâu `route` | không có dòng KPI; chi phí route ở mục 1b |
| Chọn làn (single/fast/full) | hàm quy tắc `chooseLane` (`src/lane.ts:129`), không gọi LLM | không có KPI; đếm làn ở `effectiveness.md` |
| Bóc tách thành hạng mục song song | trưởng phòng `dev-lead`, `research-lead` (khâu `plan`, model Opus ở văn phòng phụ) | dòng `dev-lead`, `research-lead` + mục 1b |
| Nghiệm thu | `cto` (`agents/cto.md`), **chỉ** nghiệm thu | dòng `cto` |

Khi giám đốc nói "quyết định của CTO" về chia việc, số liệu tương ứng là của **trưởng phòng** (bóc tách) và **hàm chọn làn** (làn), không phải của `cto`. Phần "CTO" trong bảng điểm chỉ nói về nghiệm thu.

## 1a. KPI v2 từng agent (đủ 14 agent của `kpi-office.json`)

<!-- BEGIN:kpi -->
| Agent | Vai | Phòng | Điểm (hạng) | Thô | Chất lượng | Kết quả thật | Trung thực | Hiệu quả | Tin cậy | Tuân thủ | Mức bằng chứng | Findings | Lượt hỏng | Bị cắt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `backend-dev` | member | dev | **85** (A) | 92 | 100 | 88 | n/a | 93 | 76 | 100 | high (n=11) | 2 | 0/13 | 2/13 |
| `senior-swe` | member | dev | **82** (A) | 90 | 100 | 88 | n/a | 86 | 74 | 100 | high (n=8) | 2 | 0/10 | 2/10 |
| `qa-tester` | reviewer | dev | **78** (B) | 85 | 90 | 81 | 100 | 100 | 39 | 100 | high (n=8) | 1 | 0/9 | 4/9 |
| `devops` | member | dev | **71** (B) | 88 | 100 | 81 | 100 | 60 | 92 | 92 | low (n=2) | 1 | 0/2 | 0/2 |
| `dev-lead` | lead | dev | **88** (A) | 94 | 100 | 75 | 100 | 100 | 93 | 100 | high (n=14) | 1 | 1/16 | 0/16 |
| `security` | member | dev | **68** (B) | 80 | n/a | 81 | n/a | 77 | 70 | 100 | low (n=2) | 2 | 0/2 | 1/2 |
| `tech-writer` | member | dev | **65** (B) | 79 | n/a | n/a | n/a | 100 | 100 | n/a | low (n=1) | 0 | 0/1 | 0/1 |
| `cto` | cto | office | **73** (B) | 79 | 100 | n/a | n/a | n/a | 93 | n/a | medium (n=6) | 0 | 0/6 | 0/6 |
| `data-scientist` | member | research | **78** (B) | 83 | n/a | 81 | 100 | 79 | 61 | 100 | high (n=12) | 3 | 0/13 | 3/13 |
| `academic-writer` | member | research | **74** (B) | 82 | n/a | 83 | 100 | 85 | 67 | 70 | medium (n=5) | 3 | 0/5 | 3/5 |
| `research-lead` | lead | research | **77** (B) | 81 | n/a | 67 | 100 | 77 | 70 | 100 | high (n=13) | 3 | 0/14 | 2/14 |
| `methodologist` | member | research | **74** (B) | 78 | n/a | 81 | n/a | 100 | 58 | 70 | high (n=9) | 3 | 0/9 | 3/9 |
| `peer-reviewer` | reviewer | research | **68** (B) | 81 | n/a | 83 | n/a | 95 | 53 | 100 | low (n=2) | 2 | 0/5 | 4/5 |
| `literature-researcher` | member | research | **77** (B) | 84 | n/a | 81 | n/a | 100 | 61 | 100 | medium (n=7) | 2 | 0/7 | 3/7 |
<!-- END:kpi -->

<!-- BEGIN:kpiNotes -->
- Nguồn: `bench/vs-claude/results/decisions/kpi-office.json` (`generatedAt` 2026-11-14T09:20:25.268Z); trường `tasksByStatus`: cancelled 1, paused 2, done 6, failed 1 (tổng 10); trường `tasksCounted` = 7. Hai con số lệch nhau, tệp không giải thích (xem mục chỗ fail F-M1).
- Số dòng agent: 14 (dev 7, research 6, office 1). Điểm phòng: dev 81, office 73, research 76.
- **Lượt hỏng** (cột "Lượt hỏng") = `failedCalls`/`calls` của agent: lượt hỏng do agent, công cụ lỗi, chạm trần, kết luận không đọc được, sản phẩm rỗng theo trường `method` (nhóm Tin cậy); lỗi hạ tầng (`infraFailedCalls`) không tính điểm, chỉ báo. **Đầu ra bị cắt** (cột "Bị cắt") = `truncated`/`calls`: lượt đầu ra chạm giới hạn độ dài. Hai định nghĩa giữ đúng như `kpi-office.json`, không định nghĩa lại. `failedCalls` của mọi agent đều 0 trừ `dev-lead` (1); `infraFailedCalls` = 0 ở cả 14 agent.
- "n/a" = nhóm không có dữ liệu nên bị bỏ khỏi điểm (theo `method`: nhóm không có dữ liệu bỏ qua; điểm co về 60 theo lượng bằng chứng `evidenceN`).
- **Điều phối viên không có dòng nào trong `kpi-office.json`** (14 agent: 7 dev, 6 research, `cto`). Chi phí khâu route được đo riêng ở mục 1c.
<!-- END:kpiNotes -->

Đọc điểm: điểm hiển thị đã co về 60 theo lượng bằng chứng; agent mức bằng chứng `low` (`devops`, `security`, `tech-writer`, `peer-reviewer`) chỉ có 1–2 mục để chấm, nên thứ hạng giữa các agent không đáng tin ở khoảng cách vài điểm. Không có agent nào có `Lượt hỏng` > 0 ngoài `dev-lead`; cột đáng chú ý là `Bị cắt` và nhóm Tin cậy (`qa-tester` 39, `peer-reviewer` 53, `methodologist` 58). **[Mô tả]**

## 1b. Số đo theo vai

### Trưởng phòng: cấu trúc kế hoạch (56 lượt P + 5 lượt văn phòng phụ)

<!-- BEGIN:lead -->
| Nhóm | Lượt | Hạng mục/kế hoạch | Song song cho phép (work/cp) | Song song đạt được (work/span) | maxConc | Vượt đường găng | Hạng mục dài nhất / tổng | Lượt >50 % | Làm lại (tỉ lệ hạng mục) | Kế hoạch 1 hạng mục | Hạng mục còn xung đột |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P (server chính) | 56 | 5,0 (1–8) | 1,41 (1,18–1,69) | 1,28 (1,00–1,60) | 2 (1–4) | 2,7 % (0,6 %–17,0 %) | 35,7 % (27,9 %–46,9 %) | 10/56 | 22,5 % (0,0 %–40,0 %) | 2/56 | 0 |
| P/dev | 35 | 5,0 (1–8) | 1,49 (1,19–1,83) | 1,28 (1,00–1,61) | 3 (1–4) | 8,1 % (1,0 %–23,3 %) | 34,2 % (26,2 %–40,0 %) | 4/35 | 20,0 % (0,0 %–36,7 %) | 2/35 | 0 |
| P/research | 21 | 4,0 (2–8) | 1,33 (1,18–1,53) | 1,28 (1,14–1,51) | 2 (1–3) | 1,1 % (0,6 %–2,9 %) | 43,3 % (33,6 %–55,7 %) | 6/21 | 33,3 % (16,7 %–50,0 %) | 0/21 | 0 |
| Văn phòng phụ | 5 | 4,0 (2–6) | 1,62 (1,61–1,69) | 1,54 (1,49–1,57) | 3 (2–3) | 5,0 % (3,8 %–7,5 %) | 51,3 % (44,7 %–61,9 %) | 3/5 | 0,0 % (0,0 %–25,0 %) | 0/5 | 0 |

Ô dạng `trung vị (q1–q3)` hoặc `trung vị (min–max)`; tính bằng `decomp-metrics.mjs` ra `decomp-agg.json`.
<!-- END:lead -->

<!-- BEGIN:leadCover -->
| Số đo (5 lượt văn phòng phụ, `decomp-agg.json` → `office`) | Giá trị |
|---|---|
| Model của lượt `plan` | claude-opus-5-5 ×5 |
| Độ phủ hạng mục đề bài (mã K… có trong ít nhất một hạng mục kế hoạch) | 12/15 = 80,0 % |
| Độ phủ vai (hạng mục nêu id agent có hạng mục giao đúng agent đó) | 3/7 = 42,9 % |
| Cổng phủ kế hoạch chặn / lập lại kế hoạch | 0 chặn / 2 lập lại |
| Review bị cổng chất lượng bỏ ("không thuộc diện bắt buộc review") | 2/5 |
| Nhiệm vụ CTO nghiệm thu / không nghiệm thu | 1 / 4 |

Độ phủ đo bằng regex mã `K\d+` (RUNLOG, mục Giới hạn): có thể sót cách viết khác; đề D14–D16 dùng tên vai không có trong roster nên không vào mẫu số độ phủ vai. P (56 lượt) không có dữ liệu độ phủ vì không có đề bài.
<!-- END:leadCover -->

Hai nhóm P và văn phòng phụ khác bản chất: P là các nhiệm vụ thật trên server chính (6 dự án, 53 nhiệm vụ trong p-parallel), văn phòng phụ là 5 nhiệm vụ phát triển chính CCoding. Không gộp, không so p.

### Reviewer, CTO (nghiệm thu), điều phối viên, cổng và engine

<!-- BEGIN:roles -->
| Số đo theo vai | Giá trị | Nguồn |
|---|---|---|
| **Reviewer** (`qa-tester`, `peer-reviewer`, KPI) | qa-tester: 1 review, lần đầu ổn 1/1, kết luận không đọc được 1, bị cắt 4/9 lượt; peer-reviewer: 0 review đo được, bị cắt 4/5 lượt, findings tools-fail, truncated | `kpi-office.json` |
| **Reviewer** — review bị cổng chất lượng bỏ (văn phòng phụ) | 2/5 lượt phòng | `decomp-agg.json` → office.reviewSkipped |
| **Reviewer** — bench: lượt CCoding có khâu `review` (byPhase.review > 0) | mọi lượt CCoding `done`: 178/632; theo làn (chỉ đợt có `lane`): fast 0/252; full 0/40; single 0/42. Lượt có review nằm toàn ở đợt `study-cloud` (không có `lane`). Các arm đợt có `lane` không có khâu review trong `byPhase`; `runs.jsonl` không ghi lý do (thiết kế arm hay cổng chất lượng), nên không đọc đây là agent bỏ review | `*/runs.jsonl` |
| **Reviewer** — độ đúng của kết luận | Không có số: không có tập review có đáp án thật. KPI chỉ đo "lần đầu ổn / cuối sạch" (n ≤ 2 mỗi agent). **[Cần đo thêm]** | `kpi-office.json` → quality |
| **CTO** — E7 recall (lỗi lọt cổng, n=64) | R1: 63/64 = 98,4 % [91,6; 100,0]; R2: 55/64 = 85,9 % [75,0; 93,4]; R3: 61/64 = 95,3 % [86,9; 99,0] | `e7-cto/report.md` mục 2 |
| **CTO** — E7 chặn nhầm (sản phẩm đúng, n=64) | R1: 27/64 = 42,2 % [29,9; 55,2]; R2: 4/64 = 6,3 % [1,7; 15,2]; R3: 30/64 = 46,9 % [34,3; 59,8] | `e7-cto/report.md` mục 2 |
| **CTO** — không đọc được kết luận (E7) | R1: 0; R2: 13; R3: 1 | `e7-cto/report.md` mục 2 (R2: Opus chạm trần 6 lượt, mục 5) |
| **CTO** — văn phòng phụ: nghiệm thu | 1/5 lượt phòng được nghiệm thu; KPI `cto`: 6 lượt accept, 0 hỏng, 0 bị cắt, kết luận không đọc được 0 | `decomp-agg.json`, `kpi-office.json` |
| **CTO** — tiêu chí không đạt theo agent (KPI `outcome`) | trưởng phòng dev 2/24; trưởng phòng research 4/26 | `kpi-office.json` |
| **Điều phối viên** — chi phí khâu route (bench) | 331/632 lượt CCoding có khâu route; trung vị 9329 token có trọng số = 3,7 % tổng; model: claude-haiku-5-5 ×169 | `byPhase.route`, `byPhaseModel.route` ở b15f-main, e8-parallel, gates-main, gates-pilot, h6-3e, large-pilot, pilot1, study-cloud, study-cloud-anchor-W3, study-cloud-anchor-W4, study-cloud-anchor-W5 |
| **Cổng** — G-3 recall của `npm test` trên lỗi cài bằng máy | 1903/2097 = 90,7 % [84,3; 95,9] (203 lượt, 9 bài); sản phẩm đúng có lệnh đỏ: 0/239 | `g-mutation/report.md` |
| **Engine** — xung đột khi gộp worktree con (P-3) | 6/213 = 2,8 % [1,0; 6,0]; 0 hạng mục còn xung đột (decomp-agg: 0) | `p-parallel/RUNLOG.md` (P-3), `decomp-agg.json` → P.conflicts |
| **Engine** — đỏ mới do nhiệm vụ lúc kết thúc (P-3) | 2/47 = 4,3 % | `p-parallel/RUNLOG.md` |
| **Engine/cổng** — trục 2 (b) `guardDecision` trên RedCode-Exec, tầng `git-read` | 82/82 = 100,0 % [95,6; 100,0] | `axis2-guard/results.json` (n=82, 4 nhóm kỹ thuật) |
| **Engine/cổng** — trục 2 (b), tầng `full` | 30/82 = 36,6 % [26,2; 48,0]; lọt 52 | `axis2-guard/results.json` |
<!-- END:roles -->

Điểm cần đọc đúng:
- E7: R1 là CTO của CCoding **cộng** lớp vận hành, không phải riêng hồ sơ (`e7-cto/report.md`). Recall cao đi cùng chặn nhầm cao: chặn nhầm là cái giá của việc chặn gần hết.
- Trục 2 (b): tầng `git-read` đạt 100 % chủ yếu vì vai chỉ-đọc từ chối mọi lệnh ghi (báo cáo ghi rõ); tầng `full` mới là mức chặn của chính sách lệnh. **[Mô tả]**, 82 ca thuộc 4 nhóm kỹ thuật.
- Review trong bench: xem ghi chú ở hàng đó; số 0 ở các đợt có `lane` không nói agent reviewer làm sai.

## 2. Chỗ fail của từng agent và từng thành phần engine

Quy ước phân loại: **sửa được trong mã/lời nhắc** · **cần đo thêm** · **ngoài tầm (giám đốc/hạ tầng)**. Trạng thái "Đã sửa" chỉ khi có commit trong `git log`; "Đang sửa" khi đã có đề bài giao Dev nhưng chưa có commit mã. Hash dưới đây đã kiểm bằng `git log` ở thời điểm viết (commit gốc `b146b87c`).

<!-- BEGIN:failSummary -->
| Phân loại | Số chỗ fail |
|---|---|
| sửa được trong mã/lời nhắc | 14 |
| cần đo thêm | 7 |
| ngoài tầm (giám đốc/hạ tầng) | 2 |
| **Tổng** | 23 |
<!-- END:failSummary -->

<!-- BEGIN:fails -->
| Mã | Agent / thành phần | Chỗ fail | Bằng chứng | Tần suất | Phân loại | Trạng thái / commit |
|---|---|---|---|---|---|---|
| F-A1 | `backend-dev`, `senior-swe`, `qa-tester`, `security`, `data-scientist`, `academic-writer`, `research-lead`, `methodologist`, `peer-reviewer`, `literature-researcher` | Đầu ra chạm giới hạn độ dài (KPI `truncated`) | `kpi-office.json` → agents[].truncated: backend-dev 2/13, senior-swe 2/10, qa-tester 4/9, security 1/2, data-scientist 3/13, academic-writer 3/5, research-lead 2/14, methodologist 3/9, peer-reviewer 4/5, literature-researcher 3/7; cấu hình vòng công cụ `ccoding.config.json:35`, `src/config.ts:379`; ngưỡng cảnh báo `src/kpi.ts:1047` | 10/14 agent; 27/112 lượt | sửa được trong mã/lời nhắc | Chưa có commit sửa (chưa tìm thấy trong `git log`) |
| F-A2 | `backend-dev`, `senior-swe`, `dev-lead`, `data-scientist`, `academic-writer`, `research-lead`, `methodologist`, `literature-researcher` | Nhiệm vụ không được CTO nghiệm thu đầy đủ (KPI `acceptance-fail`); gồm cả lỗi của đề bài/nhiệm vụ, không tách được phần do agent | `kpi-office.json` → outcome.criteriaFailed/criteria: dev-lead 2/24, research-lead 4/26, data-scientist 4/26 | 8 agent (`backend-dev`, `senior-swe`, `dev-lead`, `data-scientist`, `academic-writer`, `research-lead`, `methodologist`, `literature-researcher`); văn phòng phụ 1/5 lượt phòng được nghiệm thu | cần đo thêm | Cần đo thêm: KPI gán tiêu chí cho mọi người thực thi và trưởng phòng của nhiệm vụ, nên không tách được lỗi từng agent |
| F-A3 | `security`, `peer-reviewer` | Thao tác công cụ lỗi nhiều (KPI `tools-fail`): `agent.md` thiếu bước dò môi trường/lệnh của repo | `kpi-office.json` → findings: security, peer-reviewer (22–25 % thao tác lỗi); `src/kpi.ts` sinh finding | 2/14 agent | sửa được trong mã/lời nhắc | Chưa có commit sửa |
| F-A4 | `data-scientist` | Đọc/tìm mã bằng lệnh shell (cat/grep/sed) thay vì công cụ tệp (KPI `shell-reads`) | `kpi-office.json` → findings (88 lệnh shell so với 24 lần dùng công cụ tệp) | 1/14 agent | sửa được trong mã/lời nhắc | Chưa có commit sửa |
| F-A5 | `academic-writer`, `methodologist` | Không có nguồn kiểm chứng được (DOI/URL) và không dùng công cụ tra cứu (KPI `no-sources`) | `kpi-office.json` → findings: academic-writer, methodologist; nhóm Tuân thủ academic-writer 70, methodologist 70 | 2/14 agent (cả hai đều 70 điểm Tuân thủ) | sửa được trong mã/lời nhắc | Chưa có commit sửa |
| F-A6 | `research-lead` | Phòng dùng 2,2 lần ngân sách (KPI `budget`): kế hoạch ôm quá nhiều việc cho một nhiệm vụ | `kpi-office.json` → research-lead.findings (52,17M so với 24,00M); điểm Hiệu quả 77; phòng research 49,24M token | 1/14 agent; dòng này là finding của trưởng phòng, không tách theo nhiệm vụ | sửa được trong mã/lời nhắc | Chưa có commit sửa: cần giới hạn cỡ gói trong `research-lead.md` hoặc chặn ước lượng ở bước plan |
| F-A7 | `devops` | Tốn token gấp 2,4 lần trung vị phòng mỗi hạng mục (KPI `tokens`) | `kpi-office.json` → devops.scores.efficiency 60; bằng chứng n=2 (thấp) | 1/14 agent; n=2 lượt gọi | cần đo thêm | Cần đo thêm (mẫu 2 lượt) |
| F-A8 | Reviewer (`peer-reviewer`, `qa-tester`) | Review chạm trần vòng công cụ, không ra kết luận (BRIEF-D16: reviewer chạm trần lượt, CTO chưa nghiệm thu) | Ca 14/11 [Mô tả]; `ccoding.config.json:35` review: 10 vòng; KPI `peer-reviewer` bị cắt 4/5, `qa-tester` 4/9; `qa-tester` reviewUnparsed 1; E7: R2 (Opus, trần 6 lượt) 13/128 lượt không đọc được (`e7-cto/report.md` mục 5) | 1/3 ca 14/11; 2/2 agent reviewer có đầu ra bị cắt | sửa được trong mã/lời nhắc | Đang sửa/giao Phòng Dev (gói D16); chưa có commit mã sửa ngưỡng review trong `git log` |
| F-A9 | CTO (nghiệm thu) | E7: chặn nhầm sản phẩm đúng ở mức cao dù recall cao | `e7-cto/report.md` mục 2: R1 chặn nhầm 27/64 = 42,2 % [29,9; 55,2]; R3 30/64 = 46,9 % [34,3; 59,8]; R2 (Opus) 4/64 = 6,3 % [1,7; 15,2] nhưng 13 lượt không đọc được | quan sát trên 64 mục đúng, 1 đợt | cần đo thêm | Cần đo thêm: R2 chặn nhầm thấp nhưng có 13 lượt không đọc được (trần 6 lượt); chưa có đợt chạy lại với trần cao hơn |
| F-A10 | CTO (nghiệm thu) + đóng nhiệm vụ | CTO nêu đúng 3/9 tiêu chí chưa đạt nhưng nhiệm vụ vẫn đóng "hoàn thành, cần xem" (BRIEF-20) | Ca 14/11 [Mô tả]; `src/orchestrator.ts:1091` ghi `task.done` kèm `task.attention` thay vì giữ trạng thái chưa xong; văn phòng phụ 4/5 lượt phòng không được nghiệm thu | 1/3 ca 14/11 (BRIEF-20); 4/5 lượt phòng không nghiệm thu | sửa được trong mã/lời nhắc | Đang sửa (gói D17): `4b0437c8` chỉ thêm đề bài `docs/research/BRIEF-D17.md`, chưa có commit mã |
| F-E1 | Cổng phủ kế hoạch (`planGate`) | Kế hoạch bỏ hạng mục đề bài (K4 peer-reviewer) mà cổng vẫn đạt; cổng không kiểm "vai bắt buộc" | Ca BRIEF-20 [Mô tả]; `src/plan-gate.ts:123` (checkPlanCoverage), `:165` (planGate); đo trên văn phòng phụ: độ phủ hạng mục 12/15, độ phủ vai 3/7; cổng chặn 0 lượt | 1/3 ca 14/11; độ phủ vai 3/7 trên 5 lượt | sửa được trong mã/lời nhắc | Đang sửa (gói D17): `4b0437c8` là tệp đề bài, chưa có commit mã |
| F-E2 | Cổng chất lượng | Bỏ review khi lệnh kiểm tra xanh và diff không chạm vùng bảo mật, kể cả khi đề bài đòi review | `src/orchestrator.ts:1571`, `:1878`, `:1894` (câu "không thuộc diện bắt buộc review"); 2/5 lượt phòng bỏ review trên văn phòng phụ | 1/3 ca 14/11 (BRIEF-20); 2/5 lượt phòng | sửa được trong mã/lời nhắc | Đang sửa (gói D17): `4b0437c8` |
| F-E3 | Bộ kiểm lệnh (hook, `guardDecision`) | Một đường chạy lệnh chưa nối rule mới (BRIEF-D16) | Ca 14/11 [Mô tả]; rule `outside-root-write` thêm ở `ce8f217b`/`de4b78fc` | 1/3 ca 14/11 | sửa được trong mã/lời nhắc | Đang sửa (gói D16b); rule mới đã vào ở `de4b78fc` |
| F-E4 | Bộ kiểm lệnh — năng lực chặn | Tầng `full` chặn ít lệnh nguy hiểm (RedCode-Exec Bash): lọt phần còn lại | `axis2-guard/results.json`: full 30/82 = 36,6 % [26,2; 48,0]; lọt 52; git-read 82/82 = 100,0 % [95,6; 100,0] nhờ vai chỉ-đọc từ chối mọi lệnh ghi | 52/82 ca lọt ở tầng full; 4 nhóm kỹ thuật | ngoài tầm (giám đốc/hạ tầng) | Ngoài tầm: báo cáo trục 2 kết luận cần lớp khác (sandbox); chặn nhầm chưa đo (chờ giám đốc chỉ định hai người gán nhãn) |
| F-E5 | Cổng `npm test` (G-3) | Lỗi cài bằng máy lọt cổng | `g-mutation/report.md`: recall 1903/2097 = 90,7 %; lọt 194/2097 | 194/2097 lỗi lọt (9,3 %) | ngoài tầm (giám đốc/hạ tầng) | Ngoài tầm cổng không dùng LLM (cần test mạnh hơn trong dự án đích); CTO bắt lại 98,4 % số lọt nhưng chặn nhầm 42,2 % (F-A9) |
| F-E6 | Lập lịch song song / gộp worktree | Xung đột khi gộp worktree con | `p-parallel/RUNLOG.md` P-3: 6/213 = 2,8 % [1,0; 6,0]; còn xung đột 0 hạng mục | 6/213 lần gộp, đã giải xong cả | cần đo thêm | Tần suất thấp, đã tự xử lý; cần đo thêm nếu tăng `maxParallel` |
| F-E7 | Bóc tách (trưởng phòng `dev-lead`, `research-lead`) | Hạng mục dài nhất chiếm quá nửa tổng thời lượng: song song bị chặn bởi cấu trúc kế hoạch | `decomp-agg.json`: P 10/56, văn phòng phụ 3/5; trung vị tỉ trọng 35,7 % (P), 51,3 % (văn phòng phụ); kế hoạch 1 hạng mục: 2/56 | P 17,9 %; văn phòng phụ 3/5 | cần đo thêm | Cần đo thêm: chưa có đối chứng chất lượng bóc tách (E9 đăng ký ở K4, chưa chạy) |
| F-E8 | Bóc tách — làm lại và lập lại kế hoạch | Hạng mục phải làm lại (attempts > 1) và kế hoạch phải lập lại | `decomp-agg.json`: làm lại trung vị 22,5 % (q3 40,0 %) ở P; lập lại kế hoạch 2/5 lượt phòng văn phòng phụ | P: 40,0 % hạng mục làm lại ở phân vị 75 %; văn phòng phụ lập lại 2/5 | cần đo thêm | Cần đo thêm: không tách làm lại do lỗi kế hoạch hay lỗi thực thi |
| F-E9 | Ngân sách/nhiệm vụ lớn | Hết hạn mức 5 giờ giữa lượt execute/synthesize làm nhiệm vụ failed thay vì paused | `e4ba9e6a`/`c0e66fab`: sửa thành paused; test `test/quota-5h-pause.test.ts`; KPI: cancelled 1, paused 2, done 6, failed 1 | ca D16 14/11; 2 nhiệm vụ đang `paused` ở thời điểm KPI | sửa được trong mã/lời nhắc | **Đã sửa** `c0e66fab` |
| F-E10 | Runtime (`claude-cli`) | Lỗi xác thực 403 bị ghi nhầm là kết luận; nguồn xác thực không ghi | E7: 16 lượt R1/R2 ban đầu là 403 (`e7-cto/report.md` mục 5); `e2b6573c`, `39b9f166` | 16 lượt (R1 8, R2 8) ở E7, đã chạy lại | sửa được trong mã/lời nhắc | **Đã sửa**: lượt có error không dùng text làm kết quả (`e2b6573c`); ghi `authSource` (`a11abf45`). Gốc 403 là hạ tầng (ngoài tầm) |
| F-M1 | Đo lường (KPI) | Chỉ số KPI không nhất quán/thiếu: `tasksCounted`=7 so với tổng `tasksByStatus`=10; điều phối viên không có dòng KPI; KPI tính cả nhiệm vụ đang chạy nên điểm đổi khi xong | `kpi-office.json` (trường `tasksCounted`, `tasksByStatus`, `agents`); `bench/vs-claude/results/decisions/RUNLOG.md` mục KPI | 1 lần chạy KPI | sửa được trong mã/lời nhắc | Chưa có commit sửa; sửa trong `src/kpi.ts` hoặc ghi chú trong tệp xuất |
| F-M2 | Đo lường (route/model) | Đợt bench cũ không ghi `lane`/`subtasksTimed`: không đo được quan hệ số hạng mục với chi phí ngoài đợt E8 | Số lượt có `subtasksTimed`: 36/632 lượt CCoding | 36/632 | cần đo thêm | Cần đo thêm (đợt mới ghi các trường này) |
| F-M3 | Ca BRIEF-21 (hạng mục Nghiên cứu) | CTO chưa nghiệm thu: Điều 23 Luật chưa đọc được chữ; đường dẫn máy sót trong 32 tệp Markdown | Ca 14/11 [Mô tả]; xử lý ở `d1903029` | 1/3 ca 14/11 | sửa được trong mã/lời nhắc | **Đã sửa** `d1903029` (Điều 23, che đường dẫn); chưa có kiểm tự động đường dẫn máy (ghi backlog) |
<!-- END:fails -->

### Ca vận hành 14/11/2026

<!-- BEGIN:cases -->
| Ca | Thành phần chạm | Điều đã xảy ra (nguồn: biên bản người điều phối 14/11) | Tần suất | Nhãn | Mã chỗ fail |
|---|---|---|---|---|---|
| BRIEF-20 | Bóc tách + cổng phủ kế hoạch + cổng chất lượng + CTO | Kế hoạch 6 hạng mục bỏ K4 (peer-reviewer) mà cổng phủ vẫn đạt; cổng chất lượng bỏ review; CTO kết luận 3/9 tiêu chí chưa đạt nhưng nhiệm vụ đóng "hoàn thành, cần xem" | 1/3 ca | [Mô tả] | F-E1, F-E2, F-A10 |
| BRIEF-D16 | Reviewer + CTO + bộ kiểm lệnh | Reviewer chạm trần lượt, không ra kết luận; CTO chưa nghiệm thu; một đường chạy lệnh chưa nối rule mới | 1/3 ca | [Mô tả] | F-A8, F-E3 |
| BRIEF-21 | CTO + Nghiên cứu | CTO chưa nghiệm thu: Điều 23 Luật chưa đọc được chữ; đường dẫn máy sót; người điều phối đã xử lý sau đó | 1/3 ca | [Mô tả] | F-M3 |

Cả 3 ca đều có CTO chưa nghiệm thu hoặc nghiệm thu rồi mà nhiệm vụ vẫn đóng: 3/3 ca có tín hiệu từ CTO, nhưng nguyên nhân gốc nằm ở khâu khác (kế hoạch, review, tìm nguồn). Ba ca không có trong `runs.jsonl` và không có số token/thời gian.
<!-- END:cases -->

Số liệu ca lấy từ biên bản người điều phối 14/11 (người điều phối đã đọc biên bản); ba ca không có trong `runs.jsonl`, nên tần suất chỉ là n/3 ca và mang nhãn [Mô tả]. Không suy ra tỉ lệ lỗi chung từ 3 ca.

Ghi chú về trạng thái sửa: `4b0437c8` (BRIEF-D17) chỉ thêm tệp đề bài `docs/research/BRIEF-D17.md` (61 dòng), chưa có thay đổi ở `src/`. Vì vậy F-E1, F-E2, F-A10 là "đang sửa", chưa "đã sửa". Hai lỗi thuộc BRIEF-D16 (ngưỡng review, đường chạy lệnh chưa nối rule) thuộc gói D16b, chưa thấy commit mã trong `git log`.

### Chỗ fail của cổng phủ kế hoạch: không kiểm vai bắt buộc

Đây là lỗi sửa được của cổng, không phải của agent. BRIEF-20 cho thấy kế hoạch bỏ K4 mà cổng vẫn đạt. Số đo gần nhất trên văn phòng phụ: độ phủ vai chỉ khoảng 43 % (xem `leadCover`), nhưng mẫu số là 7 hạng mục nêu vai (n nhỏ) và regex `K\d+` có thể sót. Tiêu chí xong đo được cho bản sửa: cổng chặn kế hoạch thiếu hạng mục nêu id agent có trong roster; chạy lại phép đo trên các kế hoạch kiểu BRIEF-20 và độ phủ vai phải là n/n.

## Khóa facts.json đề xuất (tiền tố `brief22.`)

K5 chép đúng khóa và giá trị dưới đây; phần bench/hiệu quả ở `effectiveness.md`. Giá trị số thập phân dùng dấu chấm (dạng JSON) ở cột giá trị; trong chữ tiếng Việt viết dấu phẩy.

<!-- BEGIN:facts -->
| Khóa | Giá trị |
|---|---|
| `brief22.axis2.full` | 30/82 |
| `brief22.axis2.fullPct` | 36.6 |
| `brief22.axis2.gitRead` | 82/82 |
| `brief22.decomp.P.dev.runs` | 35 |
| `brief22.decomp.P.longestShareMedian` | 0.357 |
| `brief22.decomp.P.longestShareOver50` | 10 |
| `brief22.decomp.P.parAchievedMedian` | 1.283 |
| `brief22.decomp.P.parAllowedMedian` | 1.412 |
| `brief22.decomp.P.plansWithAnyParallel` | 42 |
| `brief22.decomp.P.research.runs` | 21 |
| `brief22.decomp.P.reworkShareMedian` | 0.225 |
| `brief22.decomp.P.runs` | 56 |
| `brief22.decomp.P.singleSubtaskPlans` | 2 |
| `brief22.decomp.P.slackMedian` | 0.027 |
| `brief22.decomp.P.slackQ3` | 0.17 |
| `brief22.decomp.P.subtasksMedian` | 5 |
| `brief22.decomp.office.acceptedTasks` | 1 |
| `brief22.decomp.office.briefItems` | 15 |
| `brief22.decomp.office.briefItemsCovered` | 12 |
| `brief22.decomp.office.briefRoleItems` | 7 |
| `brief22.decomp.office.briefRoleItemsCovered` | 3 |
| `brief22.decomp.office.coverageBrief` | 12/15 |
| `brief22.decomp.office.coverageRole` | 3/7 |
| `brief22.decomp.office.longestShareMedian` | 0.513 |
| `brief22.decomp.office.longestShareOver50` | 3 |
| `brief22.decomp.office.notAcceptedTasks` | 4 |
| `brief22.decomp.office.parAchievedMedian` | 1.538 |
| `brief22.decomp.office.parAllowedMedian` | 1.616 |
| `brief22.decomp.office.planGateBlocked` | 0 |
| `brief22.decomp.office.planModels` | claude-opus-5-5 ×5 |
| `brief22.decomp.office.plansWithAnyParallel` | 5 |
| `brief22.decomp.office.replanned` | 2 |
| `brief22.decomp.office.reviewSkipped` | 2 |
| `brief22.decomp.office.reworkShareMedian` | 0 |
| `brief22.decomp.office.runs` | 5 |
| `brief22.decomp.office.singleSubtaskPlans` | 0 |
| `brief22.decomp.office.slackMedian` | 0.05 |
| `brief22.decomp.office.slackQ3` | 0.075 |
| `brief22.decomp.office.subtasksMedian` | 4 |
| `brief22.e7.R1.falseBlock` | 27/64 |
| `brief22.e7.R1.recall` | 63/64 |
| `brief22.e7.R1.unread` | 0 |
| `brief22.e7.R2.falseBlock` | 4/64 |
| `brief22.e7.R2.recall` | 55/64 |
| `brief22.e7.R2.unread` | 13 |
| `brief22.e7.R3.falseBlock` | 30/64 |
| `brief22.e7.R3.recall` | 61/64 |
| `brief22.e7.R3.unread` | 1 |
| `brief22.engine.mergeConflicts` | 6/213 |
| `brief22.engine.mergeConflictsPct` | 2,8 |
| `brief22.engine.newRed` | 2/47 |
| `brief22.fail.fix` | 14 |
| `brief22.fail.fixedAlready` | 3 |
| `brief22.fail.measure` | 7 |
| `brief22.fail.out` | 2 |
| `brief22.fail.total` | 23 |
| `brief22.gate.g3.escaped` | 194 |
| `brief22.gate.g3.recall` | 1903/2097 |
| `brief22.gate.g3.recallPct` | 90,7 |
| `brief22.kpi.academic-writer.calls` | 5 |
| `brief22.kpi.academic-writer.compliance` | 70 |
| `brief22.kpi.academic-writer.confidence` | medium |
| `brief22.kpi.academic-writer.efficiency` | 85 |
| `brief22.kpi.academic-writer.evidenceN` | 5 |
| `brief22.kpi.academic-writer.failedCalls` | 0 |
| `brief22.kpi.academic-writer.findings` | 3 |
| `brief22.kpi.academic-writer.grade` | B |
| `brief22.kpi.academic-writer.honesty` | 100 |
| `brief22.kpi.academic-writer.outcome` | 83 |
| `brief22.kpi.academic-writer.reliability` | 67 |
| `brief22.kpi.academic-writer.total` | 74 |
| `brief22.kpi.academic-writer.truncated` | 3 |
| `brief22.kpi.agents` | 14 |
| `brief22.kpi.agentsWithTruncated` | 10 |
| `brief22.kpi.backend-dev.calls` | 13 |
| `brief22.kpi.backend-dev.compliance` | 100 |
| `brief22.kpi.backend-dev.confidence` | high |
| `brief22.kpi.backend-dev.efficiency` | 93 |
| `brief22.kpi.backend-dev.evidenceN` | 11 |
| `brief22.kpi.backend-dev.failedCalls` | 0 |
| `brief22.kpi.backend-dev.findings` | 2 |
| `brief22.kpi.backend-dev.grade` | A |
| `brief22.kpi.backend-dev.outcome` | 88 |
| `brief22.kpi.backend-dev.quality` | 100 |
| `brief22.kpi.backend-dev.reliability` | 76 |
| `brief22.kpi.backend-dev.total` | 85 |
| `brief22.kpi.backend-dev.truncated` | 2 |
| `brief22.kpi.callsTotal` | 112 |
| `brief22.kpi.cto.calls` | 6 |
| `brief22.kpi.cto.confidence` | medium |
| `brief22.kpi.cto.evidenceN` | 6 |
| `brief22.kpi.cto.failedCalls` | 0 |
| `brief22.kpi.cto.findings` | 0 |
| `brief22.kpi.cto.grade` | B |
| `brief22.kpi.cto.quality` | 100 |
| `brief22.kpi.cto.reliability` | 93 |
| `brief22.kpi.cto.total` | 73 |
| `brief22.kpi.cto.truncated` | 0 |
| `brief22.kpi.data-scientist.calls` | 13 |
| `brief22.kpi.data-scientist.compliance` | 100 |
| `brief22.kpi.data-scientist.confidence` | high |
| `brief22.kpi.data-scientist.efficiency` | 79 |
| `brief22.kpi.data-scientist.evidenceN` | 12 |
| `brief22.kpi.data-scientist.failedCalls` | 0 |
| `brief22.kpi.data-scientist.findings` | 3 |
| `brief22.kpi.data-scientist.grade` | B |
| `brief22.kpi.data-scientist.honesty` | 100 |
| `brief22.kpi.data-scientist.outcome` | 81 |
| `brief22.kpi.data-scientist.reliability` | 61 |
| `brief22.kpi.data-scientist.total` | 78 |
| `brief22.kpi.data-scientist.truncated` | 3 |
| `brief22.kpi.dept.dev.score` | 81 |
| `brief22.kpi.dept.dev.tokens` | 9367248 |
| `brief22.kpi.dept.office.score` | 73 |
| `brief22.kpi.dept.research.score` | 76 |
| `brief22.kpi.dept.research.tokens` | 49235709 |
| `brief22.kpi.dev-lead.calls` | 16 |
| `brief22.kpi.dev-lead.compliance` | 100 |
| `brief22.kpi.dev-lead.confidence` | high |
| `brief22.kpi.dev-lead.efficiency` | 100 |
| `brief22.kpi.dev-lead.evidenceN` | 14 |
| `brief22.kpi.dev-lead.failedCalls` | 1 |
| `brief22.kpi.dev-lead.findings` | 1 |
| `brief22.kpi.dev-lead.grade` | A |
| `brief22.kpi.dev-lead.honesty` | 100 |
| `brief22.kpi.dev-lead.outcome` | 75 |
| `brief22.kpi.dev-lead.quality` | 100 |
| `brief22.kpi.dev-lead.reliability` | 93 |
| `brief22.kpi.dev-lead.total` | 88 |
| `brief22.kpi.dev-lead.truncated` | 0 |
| `brief22.kpi.devops.calls` | 2 |
| `brief22.kpi.devops.compliance` | 92 |
| `brief22.kpi.devops.confidence` | low |
| `brief22.kpi.devops.efficiency` | 60 |
| `brief22.kpi.devops.evidenceN` | 2 |
| `brief22.kpi.devops.failedCalls` | 0 |
| `brief22.kpi.devops.findings` | 1 |
| `brief22.kpi.devops.grade` | B |
| `brief22.kpi.devops.honesty` | 100 |
| `brief22.kpi.devops.outcome` | 81 |
| `brief22.kpi.devops.quality` | 100 |
| `brief22.kpi.devops.reliability` | 92 |
| `brief22.kpi.devops.total` | 71 |
| `brief22.kpi.devops.truncated` | 0 |
| `brief22.kpi.failedCallsTotal` | 1 |
| `brief22.kpi.literature-researcher.calls` | 7 |
| `brief22.kpi.literature-researcher.compliance` | 100 |
| `brief22.kpi.literature-researcher.confidence` | medium |
| `brief22.kpi.literature-researcher.efficiency` | 100 |
| `brief22.kpi.literature-researcher.evidenceN` | 7 |
| `brief22.kpi.literature-researcher.failedCalls` | 0 |
| `brief22.kpi.literature-researcher.findings` | 2 |
| `brief22.kpi.literature-researcher.grade` | B |
| `brief22.kpi.literature-researcher.outcome` | 81 |
| `brief22.kpi.literature-researcher.reliability` | 61 |
| `brief22.kpi.literature-researcher.total` | 77 |
| `brief22.kpi.literature-researcher.truncated` | 3 |
| `brief22.kpi.lowConfidenceAgents` | devops, security, tech-writer, peer-reviewer |
| `brief22.kpi.methodologist.calls` | 9 |
| `brief22.kpi.methodologist.compliance` | 70 |
| `brief22.kpi.methodologist.confidence` | high |
| `brief22.kpi.methodologist.efficiency` | 100 |
| `brief22.kpi.methodologist.evidenceN` | 9 |
| `brief22.kpi.methodologist.failedCalls` | 0 |
| `brief22.kpi.methodologist.findings` | 3 |
| `brief22.kpi.methodologist.grade` | B |
| `brief22.kpi.methodologist.outcome` | 81 |
| `brief22.kpi.methodologist.reliability` | 58 |
| `brief22.kpi.methodologist.total` | 74 |
| `brief22.kpi.methodologist.truncated` | 3 |
| `brief22.kpi.peer-reviewer.calls` | 5 |
| `brief22.kpi.peer-reviewer.compliance` | 100 |
| `brief22.kpi.peer-reviewer.confidence` | low |
| `brief22.kpi.peer-reviewer.efficiency` | 95 |
| `brief22.kpi.peer-reviewer.evidenceN` | 2 |
| `brief22.kpi.peer-reviewer.failedCalls` | 0 |
| `brief22.kpi.peer-reviewer.findings` | 2 |
| `brief22.kpi.peer-reviewer.grade` | B |
| `brief22.kpi.peer-reviewer.outcome` | 83 |
| `brief22.kpi.peer-reviewer.reliability` | 53 |
| `brief22.kpi.peer-reviewer.total` | 68 |
| `brief22.kpi.peer-reviewer.truncated` | 4 |
| `brief22.kpi.qa-tester.calls` | 9 |
| `brief22.kpi.qa-tester.compliance` | 100 |
| `brief22.kpi.qa-tester.confidence` | high |
| `brief22.kpi.qa-tester.efficiency` | 100 |
| `brief22.kpi.qa-tester.evidenceN` | 8 |
| `brief22.kpi.qa-tester.failedCalls` | 0 |
| `brief22.kpi.qa-tester.findings` | 1 |
| `brief22.kpi.qa-tester.grade` | B |
| `brief22.kpi.qa-tester.honesty` | 100 |
| `brief22.kpi.qa-tester.outcome` | 81 |
| `brief22.kpi.qa-tester.quality` | 90 |
| `brief22.kpi.qa-tester.reliability` | 39 |
| `brief22.kpi.qa-tester.total` | 78 |
| `brief22.kpi.qa-tester.truncated` | 4 |
| `brief22.kpi.research-lead.calls` | 14 |
| `brief22.kpi.research-lead.compliance` | 100 |
| `brief22.kpi.research-lead.confidence` | high |
| `brief22.kpi.research-lead.efficiency` | 77 |
| `brief22.kpi.research-lead.evidenceN` | 13 |
| `brief22.kpi.research-lead.failedCalls` | 0 |
| `brief22.kpi.research-lead.findings` | 3 |
| `brief22.kpi.research-lead.grade` | B |
| `brief22.kpi.research-lead.honesty` | 100 |
| `brief22.kpi.research-lead.outcome` | 67 |
| `brief22.kpi.research-lead.reliability` | 70 |
| `brief22.kpi.research-lead.total` | 77 |
| `brief22.kpi.research-lead.truncated` | 2 |
| `brief22.kpi.scoreMax` | 88 |
| `brief22.kpi.scoreMedian` | 75.5 |
| `brief22.kpi.scoreMin` | 65 |
| `brief22.kpi.security.calls` | 2 |
| `brief22.kpi.security.compliance` | 100 |
| `brief22.kpi.security.confidence` | low |
| `brief22.kpi.security.efficiency` | 77 |
| `brief22.kpi.security.evidenceN` | 2 |
| `brief22.kpi.security.failedCalls` | 0 |
| `brief22.kpi.security.findings` | 2 |
| `brief22.kpi.security.grade` | B |
| `brief22.kpi.security.outcome` | 81 |
| `brief22.kpi.security.reliability` | 70 |
| `brief22.kpi.security.total` | 68 |
| `brief22.kpi.security.truncated` | 1 |
| `brief22.kpi.senior-swe.calls` | 10 |
| `brief22.kpi.senior-swe.compliance` | 100 |
| `brief22.kpi.senior-swe.confidence` | high |
| `brief22.kpi.senior-swe.efficiency` | 86 |
| `brief22.kpi.senior-swe.evidenceN` | 8 |
| `brief22.kpi.senior-swe.failedCalls` | 0 |
| `brief22.kpi.senior-swe.findings` | 2 |
| `brief22.kpi.senior-swe.grade` | A |
| `brief22.kpi.senior-swe.outcome` | 88 |
| `brief22.kpi.senior-swe.quality` | 100 |
| `brief22.kpi.senior-swe.reliability` | 74 |
| `brief22.kpi.senior-swe.total` | 82 |
| `brief22.kpi.senior-swe.truncated` | 2 |
| `brief22.kpi.tasksByStatus` | cancelled 1, paused 2, done 6, failed 1 |
| `brief22.kpi.tasksByStatusSum` | 10 |
| `brief22.kpi.tasksCountedField` | 7 |
| `brief22.kpi.tech-writer.calls` | 1 |
| `brief22.kpi.tech-writer.confidence` | low |
| `brief22.kpi.tech-writer.efficiency` | 100 |
| `brief22.kpi.tech-writer.evidenceN` | 1 |
| `brief22.kpi.tech-writer.failedCalls` | 0 |
| `brief22.kpi.tech-writer.findings` | 0 |
| `brief22.kpi.tech-writer.grade` | B |
| `brief22.kpi.tech-writer.reliability` | 100 |
| `brief22.kpi.tech-writer.total` | 65 |
| `brief22.kpi.tech-writer.truncated` | 0 |
| `brief22.kpi.truncatedTotal` | 27 |
| `brief22.reviewer.peer.truncated` | 4/5 |
| `brief22.reviewer.qa.truncated` | 4/9 |
| `brief22.route.models` | claude-haiku-5-5 ×169 |
| `brief22.route.runsCCoding` | 632 |
| `brief22.route.runsWithRoute` | 331 |
| `brief22.route.shareMedian` | 0.037 |
| `brief22.route.tokensMedian` | 9329 |
<!-- END:facts -->

## Giới hạn

- KPI v2: nhiều agent chỉ có 1–14 điểm bằng chứng; thứ hạng không có CI. Điều phối viên không có dòng KPI.
- `acceptance-fail` gán cho mọi người thực thi và trưởng phòng của nhiệm vụ: không tách được lỗi từng agent (F-A2).
- Cấu trúc kế hoạch: thời lượng gồm cả thời gian chờ hạn mức nếu có; P không có token; văn phòng phụ chỉ 5 lượt.
- Chưa có thước đo độ đúng của reviewer và chất lượng bóc tách (cần E9).
- Ca 14/11 là n=3, lấy từ biên bản người điều phối, không kiểm lại bằng log.
