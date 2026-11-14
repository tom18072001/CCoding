# Báo cáo trả lời giám đốc: engine, chia việc, model theo vai, bảng điểm và chỗ fail (BRIEF-22, K6)

> Phòng Nghiên cứu · @research-lead · 14/11/2026 · phân loại dữ liệu: **Nội bộ**. Vận hành thật chỉ có chỉ số tổng hợp (ẩn danh "dự án A", nhóm P); không có đề bài, mã nhiệm vụ hay đường dẫn máy.
> Mốc mã: commit `b146b87c` (mọi `tệp:dòng` theo `logic-map.md`). Số không chép tay: mỗi số dẫn về tệp nguồn của K1 (`logic-map.md`), K2 (`scorecard.md`, `effectiveness.md`, sinh bởi `scorecard.mjs`, khóa `brief22.*`), K3 (`context/decomposition-sources-2026-11-14.md`), K4 (`model-per-role.md`, `preregistration.md` §9.x).
> Nhãn: **[Mô tả]** = số quan sát, không đối chứng, không nhân quả; **[Đăng ký trước]** = phép đo có đăng ký ở `preregistration.md` §9. Mức chắc chắn: **Cao** (đọc mã hoặc phép đo đăng ký trước, hiệu rõ), **Vừa** (đo có đăng ký nhưng có nhiễu, hoặc mô tả trên mẫu lớn), **Thấp** (mô tả trên mẫu nhỏ, hoặc chỉ suy từ mã), **Chưa trả lời được**.
> Mã trong báo cáo:
> - **FX1–FX21** là lỗi sửa được, **TN1–TN9** là thí nghiệm (mục 6).
> - **R1/R2/R3** chỉ dùng cho ba arm của E7: R1 là CTO Sonnet qua CCoding, R2 là Opus, R3 là Sonnet đối chứng.
> - **F-…** và **L…** là mã chỗ fail của K2 và mã lỗ hổng của K1.

## 0. Trả lời ngắn

1. **"CTO" trong câu hỏi của giám đốc là bốn thành phần khác nhau.** Điều phối viên (LLM) định tuyến. Hàm quy tắc `chooseLane` chọn làn (mã, không LLM). Trưởng phòng bóc tách (LLM, mã chỉnh lại sau). Engine lập lịch và gộp (mã). Vai `cto` **chỉ nghiệm thu**. Mức chắc chắn: **Cao** (đọc mã).
2. **Chia việc có lợi về thời gian bên trong hệ thống, chưa có lợi so với một agent.** Trên 56 lượt P, chạy song song tiết kiệm khoảng 22 % thời gian so với chạy lần lượt cùng kế hoạch (xấp xỉ, theo giả định thời lượng hạng mục không đổi khi chạy lần lượt; là nghịch đảo của tỉ số tổng thời gian làm việc trên thời gian thực), trong trần cấu trúc khoảng 29 % (nghịch đảo của work/cp trung vị 1,41) [Mô tả]. Trên bench, mọi arm CCoding tốn ×1,5–×6,3 token so với một agent (A0; cận trên ×6,34 của `study-cloud` B0 có thể khác cửa sổ chạy với arm A0, theo `effectiveness.md`), còn điểm ngang nhau vì cả hai đều chạm trần [Mô tả]. Mức chắc chắn: **Vừa** về thời gian, **Thấp** về chất lượng chia.
3. **Model:** chưa đủ bằng chứng để đổi mặc định của vai nào. Vai quyết định chia việc là trưởng phòng ở khâu `plan`. Vai này **chưa có số nào về chất lượng bóc tách**, nên E9 được đăng ký trước để đo. Mức chắc chắn: **Vừa** cho CTO (E7), **Yếu/Không có** cho các vai khác.
4. **Chia kém làm mất bao nhiêu: chưa có con số trực tiếp.** Các cận đo được: lập lịch mất khoảng 7 điểm % thời gian so với trần cấu trúc; 17,9 % lượt P có một hạng mục chiếm quá nửa thời lượng; khâu phối hợp chiếm 31,6 % token. Mức chắc chắn: **Thấp**.
5. **Bảng điểm:** đủ 14/14 agent của KPI. Điểm từ 65 (`tech-writer`) đến 88 (`dev-lead`). Chỗ yếu chung là **đầu ra bị cắt** (27/112 lượt gọi, 10/14 agent) và nhóm **Tin cậy** của reviewer. K2 xác định 23 chỗ fail: 14 sửa được, 7 cần đo thêm, 2 ngoài tầm. Mục 6 gom thành **21 lỗi sửa được (FX1–FX21)** và **9 thí nghiệm (TN1–TN9)**, mỗi mục có đủ bốn trường.

---

## 1. Engine và logic từng agent

Nguồn: `logic-map.md` (K1, commit `b146b87c`), gồm hai sơ đồ mermaid, bảng 20 agent và 13 lỗ hổng L1–L13. Mục này chỉ tóm tắt.

### 1.1 Engine (mã)

| Khâu | Ai/cái gì quyết | LLM? | Vị trí |
|---|---|---|---|
| Định tuyến | điều phối viên; lỗi thì `keywordRoute` | có | `orch:1253-1279` |
| Chọn làn single/fast/full | hàm `chooseLane` | **không** | `src/lane.ts:129-148` |
| Bóc tách | trưởng phòng; sau đó `parsePlan`, `shapeFastPlan` (làn nhanh), `planGate` | có + mã | `orch:1700-1717`, `planner.ts:95`, `plan-gate.ts:158` |
| Họp (discuss/finalize) | chỉ làn đầy, ≥ 3 hạng mục và ≥ 2 người | có | `orch:1719-1790` |
| Cổng phủ kế hoạch | `planGate`: chặn thì lập lại kế hoạch đúng 1 lần, vẫn chặn thì dừng | không | `orch:2403-2460` |
| Lập lịch, gộp | `executeAll`: `dependsOn`, `maxParallel`, mỗi người nhận một hạng mục một lúc; worktree con, commit, gộp, giải xung đột | không | `orch:2073-2154`, `orch:2902-3056` |
| Cổng chất lượng B-02 | lệnh kiểm tra + mẫu đầu ra, quyết định có gọi reviewer không | không | `orch:3205-3320`, `quality-gate.ts:33-135` |
| Review / revise | reviewer | có điều kiện | `orch:1836-2008` |
| Tổng hợp | trưởng phòng; làn nhanh dựng bằng template | có / không | `orch:2036-2065` |
| Nghiệm thu | `cto`; `accepted` do **mã** chốt (mọi tiêu chí pass) | có | `orch:1151-1237`, `planner.ts:248` |
| Đóng nhiệm vụ | `status='done'` ngay sau `accept()`, **không phụ thuộc kết quả nghiệm thu** | không | `orch:1088-1094` |
| Ngân sách, ước lượng | `checkBudget`; `estimatePlan` chỉ cộng token, không có thời gian | không | `orch:2247`, `orch:2356-2383` |
| Tạm dừng / tiếp tục | `PauseSignal('quota')`, `scheduleResume` | không | `orch:3686-3690`, `orch:1097-1136` |
| Chọn model mỗi lượt | `phaseModels` → `project.models` → `config.phases.models` → hồ sơ | không | `orch:3462` |
| Log | `LogStore` JSONL, chuỗi băm sha256 (không ký số, không WORM) | không | `logger.ts:66-72` |

### 1.2 Từng agent

| Agent | Nhận | Quyết định gì (logic) | Trả | Model hồ sơ / bench | Cổng kiểm đầu ra |
|---|---|---|---|---|---|
| Điều phối viên | đề bài, danh sách phòng | chọn phòng (lời nhắc + mã lùi) | JSON phòng | sonnet; pha route chạy **haiku** | `parseRoute`; không có KPI |
| Trưởng phòng `dev-lead`, `research-lead` | đề bài, nhân sự, lịch sử | **bóc tách**, giao người, `dependsOn`; tổng hợp | JSON kế hoạch, FINAL | **opus**; ở làn nhanh pha plan chạy **sonnet** (`orch:1650`) | `parsePlan` + `planGate` + 1 lần lập lại; FINAL **không** qua cổng mẫu |
| Thành viên Dev (9 vai) | hạng mục | làm theo kỹ năng; làn đơn chọn qua `skillScore` | mã, tài liệu | sonnet (`solution-architect` opus) | lệnh kiểm tra + `templateGate` + reviewer nếu cần |
| Thành viên Nghiên cứu (4 vai) | hạng mục | như trên; chỉ `data-scientist` có `Bash` | tài liệu, script | sonnet | `templateGate` |
| Reviewer `qa-tester`, `peer-reviewer` | hạng mục đã xong, kết quả lệnh | duyệt hoặc chưa; mã có thể ép `approved=false` | JSON review | sonnet / **opus** | `parseReview`; không đọc được thì `approved=false` |
| `cto` | đề bài, FINAL, review, lệnh | **chỉ nghiệm thu** từng tiêu chí | `ACCEPTANCE.md` + JSON | sonnet; opus ở B7cabO | `parseAcceptance` |

Sáu agent không có dòng KPI: orchestrator, solution-architect, frontend-dev, data-engineer, business-analyst, ba-presales. Đây là **phạm vi đo chưa phủ**, không phải kết quả tốt.

### 1.3 Chỗ giám đốc gọi chung là "CTO"

| Câu hỏi của giám đốc | Thành phần trả lời đúng | Bằng chứng |
|---|---|---|
| "CTO định tuyến / chọn phòng" | điều phối viên | `orch:1253` |
| "CTO quyết định làm một mình hay chia" | hàm `chooseLane` (mã, không model) | `lane.ts:129` |
| "CTO chia việc, bóc tách song song" | trưởng phòng, sau đó mã `shapeFastPlan`/`planGate` | `orch:1700`, `plan-gate.ts:158` |
| "CTO cho chạy song song" | engine (`executeAll`) | `orch:2073` |
| "CTO duyệt từng phần" | cổng chất lượng (mã) + reviewer | `orch:1836-1960` |
| "CTO nghiệm thu" | `cto` (đúng tên) | `orch:1151`, `planner.ts:248` |
| "CTO đóng việc là xong" | engine: `done` bất kể nghiệm thu | `orch:1088-1090` |
| "Model của CTO" (về chia việc) | model của trưởng phòng ở khâu `plan` | `orch:3462`, `config.ts:405` |

**Mức chắc chắn: Cao** cho hành vi đọc từ mã. Đây là đọc tĩnh, chưa chạy mã, nên hành vi động chỉ là suy từ mã. Các điểm `[CHƯA KIỂM CHỨNG]` (đường herdr, `options.review` của ba ca 14/11) giữ nguyên như trong `logic-map.md` §5.

---

## 2. Chia việc có hiệu quả không

Nguồn: `effectiveness.md` mục 3a–3d, `scorecard.md` mục 1b. Số nào cũng là [Mô tả] trừ khi ghi [Đăng ký trước].

| Câu hỏi | Số | Nguồn | Cách đọc |
|---|---|---|---|
| Trưởng phòng có chia không? | 54/56 lượt P chia ≥ 2 hạng mục; trung vị 5 hạng mục (1–8) | `brief22.decomp.P.*` | Hầu như luôn chia |
| Cấu trúc kế hoạch cho phép song song bao nhiêu? | work/cp trung vị 1,41 (IQR 1,18–1,69) | `effectiveness.md` 3a | Kế hoạch có nhiều phụ thuộc nối tiếp, mức song song thấp |
| Lập lịch đạt bao nhiêu? | work/span 1,28 (1,00–1,60); vượt đường găng trung vị 2,7 % (q3 17,0 %) | 3a | **Giới hạn tốc độ chủ yếu nằm ở cấu trúc kế hoạch, không ở lập lịch** |
| Phòng nào có đuôi lập lịch? | P/dev vượt đường găng 8,1 % (q3 23,3 %); P/research 1,1 % | 3a | Giả thuyết, chờ TN6: Phòng Dev có thể mất thêm ở lập lịch, chờ gộp hoặc giới hạn người nhận (L6, L7; suy từ đọc mã, chưa đo nguyên nhân) |
| Lượt có chạy chồng (≥ 2 hạng mục chạy cùng lúc; chạy chồng chưa có nghĩa là có lợi) | 42/56 = 75,0 % [61,6; 85,6]; mẫu số 56 là mọi lượt phòng. Trên các lượt có ≥ 2 hạng mục (54, bỏ 2 kế hoạch chỉ có 1 hạng mục): 42/54 = 77,8 % | `opsDetail` | |
| Kế hoạch lệch | 10/56 = 17,9 % [8,9; 30,4] lượt có hạng mục dài nhất > 50 % tổng thời lượng; văn phòng phụ 3/5 | 3a | Ở các lượt này song song không thể nhanh hơn 2 lần |
| Làm lại | trung vị 22,5 % hạng mục (q3 40,0 %) | 3a | Chưa tách được làm lại do kế hoạch hay do thực thi |
| Song song có worktree so với tuần tự, cùng kế hoạch (E8) | `wallSecTask` B6w4/B6w1 = 0,520 [0,488; 0,552]; token 1,008 [0,942; 1,075] | `results/e8-parallel/report.md` | **[Đăng ký trước]**: giảm khoảng nửa thời gian (0,520 [0,488; 0,552]); token là thước đo phụ, chỉ mô tả: 1,008 [0,942; 1,075], CI chứa 1, không thấy thay đổi phát hiện được |
| So với một agent (A0) trên bench | token ×1,48 (B5) đến ×6,34 (B0 study-cloud); wall ×1,39 đến ×9,97; điểm lệch ≤ 0,016 | 3b | Mọi arm CCoding đắt hơn; điểm chạm trần nên không thấy lợi chất lượng |
| E8 so với A0 | B6w4 nhanh hơn A0 chỉ ở 1/3 bài (`l1-modules` 0,59) | backlog §0.1 (a) | Có lợi khi bài chia được thành phần độc lập |
| Tỉ trọng token khâu phối hợp | 31,6 % trên 632 lượt CCoding; làn fast 30,2 %, full 18,8 %, single 33,4 % | 3c | Khâu `accept` lớn nhất (12,1 %), `plan` 9,5 %, `route` 2,0 % |
| Số hạng mục với chi phí (e8, 36 lượt) | ρ(số hạng mục, token) = 0,80; ρ(số hạng mục, wall) 0,83 ở B6w1, 0,32 ở B6w4 | 3d | Thêm hạng mục thì tốn token; chạy chồng thì thời gian tăng ít hơn. ρ lẫn hiệu ứng bài |

**Kết luận.** Khi hệ thống đã chọn chạy nhiều agent, chia song song có hiệu quả về thời gian: E8 có đăng ký trước, P cho kết quả mô tả cùng chiều. Phần lợi bị giới hạn bởi **cấu trúc kế hoạch** (1,41), không bởi lập lịch. So với một agent làm cả bài, chia việc **chưa có lợi** trên bench hiện có: tốn hơn, điểm ngang. Tài liệu ngoài cùng chiều: đa agent chỉ có lợi trên việc tách được, còn trên việc tuần tự thì làm hỏng kết quả 39–70 % ở một benchmark lập kế hoạch (K3, S1, preprint).
**Mức chắc chắn:** **Vừa** về thời gian bên trong hệ thống; **Vừa** về chi phí so với A0 (nhiều đợt cùng chiều, không gộp p); **Chưa trả lời được** về chất lượng bóc tách, vì chưa có thước đo, cần E9 (TN1).

---

## 3. Model nào phù hợp cho từng vai

Nguồn: `model-per-role.md` (K4). Không đổi mặc định nào trong gói này.

| Vai | Đề xuất | Bằng chứng chính | Mức | Việc tiếp |
|---|---|---|---|---|
| Điều phối viên | **Giữ haiku** | khâu route chiếm trung vị 3,7 % token, haiku ×169 lượt; độ đúng định tuyến **chưa đo** | Yếu | TN4 |
| Hàm chọn làn | Không áp dụng (không có model) | 252 fast / 40 full / 42 single trong 334 lượt có `lane` | — | TN5 (độ đúng của quy tắc) |
| Trưởng phòng (`plan`) | **Chưa đổi; quyết định bằng E9** | Hồ sơ ghi opus nhưng làn nhanh chạy sonnet (252 lượt). Không có số về chất lượng bóc tách. Ngoài: planner mạnh + executor rẻ có lợi trên tác vụ công cụ (S4, S5), chưa có nguồn trên sửa mã | Yếu | TN1 (E9), FX18 |
| Thành viên Dev / Nghiên cứu | **Giữ sonnet** | bench chạm trần điểm; chỗ yếu là bị cắt đầu ra, không phải model | Yếu | FX8 |
| Reviewer | **Chưa đổi; sửa trần lượt trước** | `peer-reviewer` bị cắt 4/5 lượt, `qa-tester` 4/9; BRIEF-D16 chạm trần | Không có | FX6, TN3 |
| CTO (nghiệm thu) | **Giữ sonnet (R1)** | E7: recall R1/R2/R3 98,4 / 85,9 / 95,3 %; chặn nhầm 42,2 / 6,3 / 46,9 %; R2 (Opus) có 13 lượt không đọc được do trần 6 lượt; USD ×2,6 | Vừa | TN2 |

**Kết luận.** Chỉ có CTO có phép đo model đăng ký trước, và phép đo đó bị trần lượt che mất phần của Opus. Với câu hỏi giám đốc quan tâm nhất, tức model nào chia việc tốt hơn, **chưa trả lời được**. E9 là thí nghiệm trả lời câu đó. Hai việc phải làm trước khi đổi model ở bất kỳ vai nào: sửa trần lượt (FX6, TN2) và ghi đúng model thật theo làn (FX18).

---

## 4. Chia kém ảnh hưởng hiệu suất toàn hệ thống bao nhiêu

Nguồn: `effectiveness.md` mục 3e. **Chưa có con số "mất X % vì chia kém"**, vì chưa có thước đo kế hoạch tốt hay kém. Bảng dưới là các **cận** đo được.

| Kênh | Ước lượng [Mô tả] | Ý nghĩa cho giám đốc |
|---|---|---|
| Trần thời gian theo cấu trúc kế hoạch (P) | tiết kiệm tối đa ≈ 29,2 % (IQR 15,3–40,9 %) so với chạy lần lượt | Kế hoạch hiện có không cho phép nhanh hơn mức này, dù lập lịch hoàn hảo |
| Thời gian tiết kiệm đạt được (P) | ≈ 22,1 % (IQR 0,0–37,7 %); xấp xỉ, theo giả định thời lượng hạng mục không đổi khi chạy lần lượt | Phần lợi ước lượng hiện nay |
| Mất do lập lịch | ≈ 7,1 điểm % (hiệu hai trung vị, xấp xỉ); vượt đường găng trung vị 2,7 %, q3 17,0 % | Phần engine sửa được (FX13, TN6) |
| Lượt có cấu trúc lệch rõ | 10/56 = 17,9 % [8,9; 30,4] | Khoảng 1/6 lượt bị một hạng mục kéo dài |
| Token phối hợp (bench) | 31,6 % token có trọng số | Gồm cả accept/review vốn có giá trị riêng; không tách được phần do chia kém |
| So với một agent (bench) | ×1,5–×6,3 token, điểm ngang | Khi bài không chia được, chia chỉ thêm chi phí (E8: chỉ 1/3 bài nhanh hơn A0) |
| Chia sai làm hỏng kết quả | ngoài: −39 đến −70 % trên việc tuần tự, ở một benchmark lập kế hoạch (S1, preprint, không phải sửa mã) | Rủi ro chất lượng, chưa đo trong CCoding |

**Kết luận.** Trên vận hành thật, phần thời gian có thể lấy thêm bằng **lập lịch tốt hơn** là cỡ vài điểm %. Phần lớn hơn phụ thuộc vào **kế hoạch có hạng mục độc lập hay không**, tức chất lượng bóc tách. Phần này chưa đo được. Về chi phí, chia việc trên bài không chia được là lỗ rõ (×1,5 trở lên).
**Mức chắc chắn: Thấp** (cận mô tả, phép nghịch đảo trung vị). Thí nghiệm cần chạy: **E9** (TN1) và phân rã vượt đường găng theo nguyên nhân (TN6).

---

## 5. Bảng điểm và chỗ fail

Nguồn: `scorecard.md` mục 1a, 1b, 2. Bảng điểm đủ 14/14 agent của `kpi-office.json` (văn phòng phụ, 30 ngày tới 14/11/2026). Điểm đã co về 60 theo lượng bằng chứng.

### 5.1 Điểm

| Agent | Điểm | Mức bằng chứng | Chỗ yếu chính |
|---|---|---|---|
| `dev-lead` | 88 (A) | high (n=14) | 1/16 lượt hỏng (agent duy nhất có lượt hỏng); Kết quả thật 75 |
| `backend-dev` | 85 (A) | high (n=11) | bị cắt 2/13 |
| `senior-swe` | 82 (A) | high (n=8) | bị cắt 2/10 |
| `qa-tester` | 78 (B) | high (n=8) | **Tin cậy 39**; bị cắt 4/9; 1 kết luận không đọc được |
| `data-scientist` | 78 (B) | high (n=12) | bị cắt 3/13; đọc tệp bằng shell |
| `research-lead` | 77 (B) | high (n=13) | Kết quả thật 67; dùng ngân sách ×2,2 |
| `literature-researcher` | 77 (B) | medium (n=7) | bị cắt 3/7 |
| `academic-writer` | 74 (B) | medium (n=5) | bị cắt 3/5; Tuân thủ 70 |
| `methodologist` | 74 (B) | high (n=9) | Tin cậy 58; bị cắt 3/9; Tuân thủ 70 |
| `cto` | 73 (B) | medium (n=6) | 1/5 lượt phòng được nghiệm thu; E7 chặn nhầm 42,2 % (R1) |
| `devops` | 71 (B) | low (n=2) | Hiệu quả 60 (n=2) |
| `security` | 68 (B) | low (n=2) | thao tác công cụ lỗi |
| `peer-reviewer` | 68 (B) | low (n=2) | **bị cắt 4/5**, Tin cậy 53 |
| `tech-writer` | 65 (B) | low (n=1) | thiếu bằng chứng |

Cách đọc: agent mức `low` chỉ có 1–2 mục để chấm, nên **chênh vài điểm không phải thứ hạng thật** [Mô tả].

### 5.2 Fail ở phần nào

| Thành phần | Fail | Mã K2 | Trạng thái |
|---|---|---|---|
| Mọi agent thực thi và reviewer | đầu ra bị cắt 27/112 lượt, 10/14 agent | F-A1 | chưa sửa → FX8 |
| Reviewer | chạm trần lượt, không ra kết luận (BRIEF-D16) | F-A8 | đang sửa D16b → FX6 |
| Cổng phủ kế hoạch | không kiểm hạng mục/vai bắt buộc; bỏ K4 vẫn đạt (BRIEF-20); độ phủ vai 3/7 | F-E1 | đang sửa D17 → FX1, FX2 |
| Cổng chất lượng | bỏ review khi đề bài đòi; bỏ không dấu vết khi không có lệnh | F-E2 | đang sửa D17 (một phần) → FX3, FX4 |
| Engine đóng nhiệm vụ | CTO chưa đạt 3/9 tiêu chí mà vẫn "hoàn thành"; nhiệm vụ `after` chạy tiếp | F-A10 | đang sửa D17 (một phần) → FX5 |
| Bộ kiểm lệnh | rule mới chưa nối mọi đường chạy lệnh | F-E3 | đang sửa D16b (một phần) → FX7 |
| Trưởng phòng | kế hoạch lệch 10/56; làm lại 22,5 %; gói ôm ×2,2 ngân sách | F-E7, F-E8, F-A6 | cần đo (TN1) / sửa (FX12) |
| CTO | chặn nhầm 42,2 % (R1), 46,9 % (R3) | F-A9 | cần đo (TN2) |
| Đo lường KPI | `tasksCounted` 7 so với tổng trạng thái 10; điều phối viên không có KPI | F-M1 | sửa (FX17) |
| Hạ tầng | tầng `full` chặn 30/82 lệnh nguy hiểm; `npm test` lọt 9,3 % lỗi cài | F-E4, F-E5 | ngoài tầm (B-18, B-12) |
| Đã sửa | hết hạn mức thành `paused` (`c0e66fab`); lỗi 403 không thành kết luận (`e2b6573c`), `authSource` (`a11abf45`); Điều 23 và đường dẫn máy (`d1903029`) | F-E9, F-E10, F-M3 | xong; còn kiểm tự động (FX20) |

**Ba ca 14/11** (biên bản người điều phối, n = 3, [Mô tả]): cả 3/3 ca đều có tín hiệu ở khâu CTO, nhưng nguyên nhân gốc nằm ở khâu khác: kế hoạch và cổng (BRIEF-20), trần lượt của reviewer (BRIEF-D16), nội dung nguồn (BRIEF-21). Như vậy có tín hiệu từ CTO, còn nguyên nhân gốc ở khâu khác (n = 3, không đủ để kết luận CTO đúng hay sai; E7 ghi CTO chặn nhầm 42,2 % ở arm R1); chỗ fail là engine không biến kết luận của CTO thành việc tiếp theo (L3, D17 K3).
**Mức chắc chắn:** **Vừa** cho KPI của agent mức high; **Thấp** cho agent mức low và ba ca 14/11.

---

## 6. Danh sách lỗi sửa được (giao Phòng Dev sửa hết trước bản final)

Quy ước:
- Tệp `src/…` theo commit `b146b87c`.
- Trạng thái đọc bằng `git log` ngày 14/11/2026. Từ `b146b87c` trở về trước, commit chạm `src/` mới nhất là `a11abf45`. Đề bài D17 (`4b0437c8`) và D16b chỉ có tệp đề bài, chưa có commit mã.
- "Tiêu chí xong" là điều kiện đo được. Ngưỡng nào là đề xuất của trưởng phòng thì ghi "(đề xuất)", chờ giám đốc duyệt.
- Mã backlog ở cột cuối khớp `improvement-backlog.md` §0.2 và §5. Đã chèn nguyên văn vào `improvement-backlog.md` (đầu tệp, §0.2, §5) và `run-plan.md` (§10); xem mục 8.

### 6.1 Lỗi sửa được: FX1–FX21

| Mã | Lỗi | Bằng chứng | Chỗ sửa (tệp) | Tiêu chí xong đo được | Test / chỉ số kiểm lại | Trạng thái | Backlog |
|---|---|---|---|---|---|---|---|
| **FX1** | Cổng phủ kế hoạch không kiểm hạng mục và vai bắt buộc của đề bài | L1: `plan-gate.ts:42,136-145,158-178` chỉ đếm tệp nguồn; BRIEF-20 bỏ K4 vẫn đạt (1/3 ca); văn phòng phụ: độ phủ vai 3/7, cổng chặn 0 | `src/plan-gate.ts`, `test/` | Kế hoạch thiếu hạng mục có mã `K\d+` của đề bài, hoặc thiếu vai nêu trong roster ⇒ cổng chặn với `rule: brief-item`; đề bài không có mã ⇒ hành vi không đổi | 3 test D17 K1 + 3 test ràng vai D16b K4; chấm lại: độ phủ hạng mục và độ phủ vai = n/n (TN9) | **Đang sửa: D17 K1 + D16b K4** | B-20 |
| **FX2** | Lời nhắc trưởng phòng Nghiên cứu cấm tạo hạng mục cho `@peer-reviewer` ngay cả khi đề bài giao hạng mục đó | L1: `agents/research/research-lead.md:51` | `agents/research/research-lead.md` (và câu tương ứng ở `dev-lead.md` nếu có) | Câu lệnh có ngoại lệ: "trừ khi đề bài giao hạng mục mã riêng cho vai reviewer"; `test/registry.test.ts` vẫn xanh | `npm test`; khi chấm lại, kế hoạch có đề bài nêu K-reviewer thì có hạng mục cho reviewer (n/n) | Chưa giao (D17 chỉ sửa mã) | B-21 |
| **FX3** | Cổng chất lượng bỏ review khi đề bài đòi review | F-E2: `orch:1860-1899`, `quality-gate.ts:84`; 2/5 lượt phòng bỏ review; BRIEF-20 | `src/quality-gate.ts`, `src/orchestrator.ts` | Đề bài có hạng mục review ⇒ không bỏ khâu review; lý do quyết định ghi vào `gate.decision` | Test hai nhánh (D17 K2); chấm lại: số lượt bỏ review khi đề bài đòi review = 0 | **Đang sửa: D17 K2** | B-22 |
| **FX4** | Review bị bỏ mà không để dấu vết khi review tắt hoặc không có reviewer và không có lệnh kiểm tra | L2(b): `orch:1860-1892`, `orch:2020` (`run.review` giữ `undefined`) | `src/orchestrator.ts` | Nhánh này gán `run.review = {skipped: true, reason}` và đặt `attention` "chưa review"; log có sự kiện riêng | Test orchestrator: `options.review=false`, không có `checkCommands` ⇒ `run.review.skipped === true` và có `attention` | Chưa giao (ngoài phạm vi D17 K2) | B-23 |
| **FX5** | Nhiệm vụ đóng `done` dù CTO kết luận chưa đạt; nhiệm vụ `after` chạy tiếp | L3: `orch:1088-1094`, `orch:1227-1234`, `orch:876-882`; BRIEF-20 3/9 tiêu chí | `src/orchestrator.ts` (trạng thái), lời nhắc nghiệm thu (D17 K3) | (a) Có vòng bổ sung cho tiêu chí "trong phạm vi" (D17 K3); (b) hết vòng mà vẫn chưa đạt ⇒ nhiệm vụ `after` **không** tự chạy (hoặc trạng thái riêng, ví dụ `needs_review`) | 4 test D17 K3 + 1 test mới: nhiệm vụ trước `accepted=false, parsed=true` ⇒ nhiệm vụ `after` giữ chờ | **Đang sửa một phần: D17 K3**; phần (b) chưa giao | B-24 |
| **FX6** | Reviewer chạm trần lượt thì không có kết luận và không chạy lại | L4: `claude-cli.ts:238,389`, `orch:1915`, `CONTINUE_PHASES` `orch:124`; BRIEF-D16; KPI `peer-reviewer` bị cắt 4/5, `qa-tester` 4/9 | `src/orchestrator.ts`, `src/runtimes/claude-cli.ts` | Ba nhánh: lượt tiếp nối chỉ để trả JSON ⇒ chạy lại với trần cao hơn ⇒ attention rõ ràng | 3 test D16b K2; chấm lại: `reviewUnparsed` = 0 và tỉ lệ bị cắt của reviewer giảm (từ 8/14 lượt; ngưỡng ≤ 2/14, đề xuất) | **Đang sửa: D16b K2** | B-25 |
| **FX7** | Rule `outside-root-write` chỉ áp ở hook `claude-cli` | L5: chỉ gọi ở `claude-guard.ts:110`; chưa có ở `workspace.ts:604-612` (`run_command`), `workspace.ts:700` (`runCheckCommand`), `cli-agents.ts` | `src/tools/workspace.ts`, `src/runtimes/cli-agents.ts`, `src/tools/shell-policy.ts` | Mọi đường chạy lệnh cho **cùng quyết định** trên cùng bảng lệnh; ≥ 20 lệnh dev thường gặp không bị chặn nhầm | Test bảng lệnh qua mọi đường (D16b K1, K3); thêm `runCheckCommand` và codex/kimi vào bảng | **Đang sửa: D16b K1** (`run_command`); `runCheckCommand`, `cli-agents` chưa giao | B-26 |
| **FX8** | Đầu ra bị cắt ở 10/14 agent | F-A1: 27/112 lượt gọi (`kpi-office.json` → `truncated`); cấu hình vòng công cụ `ccoding.config.json:35`, `src/config.ts:379` | Bước 1: chẩn đoán từ log (chạm trần lượt hay trần token đầu ra, theo pha). Bước 2: `src/config.ts` (`phases.toolTurns`), lời nhắc "ghi sớm" | Có bảng nguyên nhân theo pha; sau sửa tỉ lệ bị cắt ≤ 10 % lượt gọi trên KPI 30 ngày (đề xuất; hiện 24,1 %) | `scorecard.mjs` trên `kpi-office.json` mới; cột "Bị cắt" | Chưa giao; **cần chẩn đoán trước khi sửa** | B-27 |
| **FX9** | Thao tác công cụ lỗi nhiều ở `security`, `peer-reviewer` | F-A3: KPI `tools-fail` (22–25 % thao tác lỗi) | `agents/dev/security.md`, `agents/research/peer-reviewer.md` (bước dò môi trường/lệnh của repo) | Finding `tools-fail` không còn ở hai agent; tỉ lệ thao tác lỗi ≤ 10 % (đề xuất) | KPI mới; `test/registry.test.ts` | Chưa giao | B-28 |
| **FX10** | `data-scientist` đọc tệp bằng lệnh shell | F-A4: 88 lệnh shell so với 24 lần dùng công cụ tệp | `agents/research/data-scientist.md` | Finding `shell-reads` không còn; số lệnh shell đọc < số lần dùng công cụ tệp | KPI mới | Chưa giao | B-29 |
| **FX11** | KPI `no-sources` ở `academic-writer`, `methodologist` (Tuân thủ 70) | F-A5 | Trước hết xác định finding đúng hay sai quy tắc: hạng mục thiết kế không cần nguồn ngoài. Sau đó sửa `agents/research/*.md`, hoặc miễn trong `src/kpi.ts` | Hoặc finding không còn khi hạng mục có nguồn, hoặc `src/kpi.ts` miễn cho hạng mục không yêu cầu nguồn, có test | KPI mới; test `kpi` | Chưa giao | B-30 |
| **FX12** | Trưởng phòng Nghiên cứu lập gói dùng ×2,2 ngân sách | F-A6: 52,17M so với 24,00M token (`kpi-office.json`) | `agents/research/research-lead.md` (giới hạn cỡ gói, tách giai đoạn); `checkEstimate` ở bước plan (`orch:2630`) | Ước lượng kế hoạch > ngân sách ⇒ cảnh báo hoặc tách nhiệm vụ trước khi chạy; finding `budget` không còn | Test `checkEstimate`; KPI mới | Chưa giao | B-31 |
| **FX13** | Ước lượng chỉ cộng token, không có thời gian đường găng | L11: `orch:2356-2383`, `src/estimate.ts:15-42` | `src/estimate.ts` | `estimatePlan` trả thêm `criticalPathEstimate` và `parallelism = work/cp` dự kiến | Test đơn vị trên kế hoạch mẫu; so dự kiến với `decomp-metrics.mjs` khi chấm lại | Chưa giao | B-32 |
| **FX14** | Lời nhắc bóc tách mâu thuẫn nhau; "1–7" khác `MAX_SUBTASKS = 8` | L8: `prompts.ts:313,316,440`; `dev-lead.md:57`; `planner.ts:25` | `src/prompts.ts`, `agents/dev/dev-lead.md` | Một quy tắc nhất quán theo làn; số trong lời nhắc lấy từ hằng `MAX_SUBTASKS` | Test: chuỗi lời nhắc chứa đúng `MAX_SUBTASKS`; `npm test` | Chưa giao (**lỗi vặt**) | B-33 |
| **FX15** | Giao người không khớp thì rơi về trưởng phòng, kể cả hạng mục cần `Bash` | L9: `planner.ts:114`; trưởng phòng không có `Bash` | `src/planner.ts`, `src/plan-gate.ts` (quy tắc B) | Assignee lạ ⇒ cổng B báo; hạng mục cần chạy lệnh không giao cho agent không có `run_command` | Test `parsePlan`/`planGate` | Chưa giao | B-34 |
| **FX16** | FINAL của trưởng phòng không qua cổng mẫu đầu ra | L12: `orch:3270-3277`, `quality-gate.ts:62` | `src/orchestrator.ts` | FINAL thiếu mục bắt buộc của mẫu ⇒ cờ trong `gate.decision` | Test `templateGate` cho FINAL | Chưa giao (**lỗi vặt**) | B-35 |
| **FX17** | KPI không nhất quán: `tasksCounted` 7 so với tổng `tasksByStatus` 10; điều phối viên không có dòng | F-M1 | `src/kpi.ts` | Tệp xuất ghi rõ định nghĩa hai trường (hoặc bằng nhau); có dòng cho điều phối viên (chi phí route, tỉ lệ lùi `keywordRoute`) | Test `kpi`; `scorecard.mjs --check` đọc được dòng mới | Chưa giao | B-36 |
| **FX18** | Hồ sơ trưởng phòng ghi opus nhưng làn nhanh chạy sonnet | K4 §2.1: `orch:1650`, `config.ts:405`; 252 lượt fast | `agents/dev/dev-lead.md`, `agents/research/research-lead.md`, `docs/AGENTS-GUIDE.md` (ghi model theo làn) | Tài liệu nêu đúng model theo làn; bài báo không viết "trưởng phòng dùng Opus" như quy tắc chung | `test/registry.test.ts`; `consistency-check` thêm mục `stale` cho câu sai | Chưa giao (**lỗi vặt**) | B-37 |
| **FX19** | `tệp:dòng` trong `logic-map.md` lệch khi mã đổi | `logic-map.md` dòng đầu (mốc `b146b87c`); K1 đã phải sửa tay một chỗ xấp xỉ (`orch:1165-1172`) | Script mới `docs/research/scripts/logic-map-check.mjs` (phạm vi Phòng Nghiên cứu) | Với mỗi tham chiếu `tệp:dòng` có tên ký hiệu, script kiểm dòng đó ở commit mốc có chứa ký hiệu; báo số tham chiếu lệch so với `HEAD` | exit 0 trên `b146b87c`; exit 1 khi cố ý sửa một số dòng | Chưa giao (Phòng Nghiên cứu) | B-38 |
| **FX20** | Chưa có kiểm tự động đường dẫn máy trong tài liệu nghiên cứu | F-M3: BRIEF-21 sót đường dẫn máy; đã che tay ở `d1903029` | `docs/research/scripts/consistency-check.mjs` (thêm mục) hoặc `facts.json` `stale` | Mẫu đường dẫn tuyệt đối (ổ đĩa Windows, thư mục home) trong `docs/research/**` ⇒ exit 1 | Cài một đường dẫn giả vào tệp tạm ⇒ exit 1; repo hiện tại ⇒ exit 0 | Chưa giao (Phòng Nghiên cứu) | B-39 |
| **FX21** | Chuỗi băm log không phải WORM hay ký số như AGENTS.md đòi | L13: `logger.ts:66-72`; AGENTS.md "log làm chứng cứ phải bất biến" | `src/logger.ts` (ký HMAC theo đoạn); phần WORM là hạ tầng | Mỗi đoạn log có chữ ký kiểm được; `chainChecker` báo sai khi sửa một dòng | Test `logger`; phần lưu trữ WORM cần giám đốc chọn hạ tầng | Chưa giao; **một phần ngoài tầm** | B-40 |

**Đã sửa, không mở mục mới:**
- F-E9 (hết hạn mức thành `paused`): `c0e66fab`, test `test/quota-5h-pause.test.ts`.
- F-E10 (lỗi 403 không thành kết luận; ghi `authSource`): `e2b6573c`, `a11abf45`. Đóng hạng 1 và 2 của backlog §0.1 (b).
- F-M3 (Điều 23, che đường dẫn máy): `d1903029`. Phần kiểm tự động còn lại là FX20.

**Ngoài tầm, không mở mục mới:**
- F-E4: tầng `full` lọt 52/82 lệnh. Cần sandbox B-18, mà sandbox cần giám đốc đăng nhập WSL (BRIEF-D16b mục "Không làm").
- F-E5: G-3 lọt 9,3 %. Cần test mạnh hơn ở dự án đích (B-12).

**Trùng gói Dev đang chạy:**
- **D17:** FX1 (K1), FX3 (K2), FX5 phần (a) (K3).
- **D16b:** FX1 phần vai (K4), FX6 (K2), FX7 phần `run_command` (K1, K3).

Phần còn lại của FX5 và FX7, cùng FX2, FX4, FX8–FX21, chưa có đề bài.

### 6.2 Lỗi chưa đủ bằng chứng: thí nghiệm cần chạy TN1–TN9

| Mã | Câu hỏi | Từ chỗ fail | Thí nghiệm | Tiêu chí xong đo được | Chỉ số kiểm lại | Backlog |
|---|---|---|---|---|---|---|
| **TN1** | Kế hoạch chia tốt hay kém; planner mạnh có giúp không | F-E7, F-E8; trưởng phòng | **E9** (`preregistration.md` §9.x): 32 bài chia được + 32 bài không chia được; planner Sonnet/Opus/Haiku; giai đoạn 1 có 576 lượt chỉ lập kế hoạch; H1 độ phủ, H2 chia thừa, Holm | Giai đoạn 1 có kết quả H1/H2 theo đăng ký; quyết định giữ hay đổi `phaseModels.plan` | độ phủ kế hoạch, tỉ lệ chia thừa; κ người gán ≥ 0,6 | B-41 |
| **TN2** | CTO Opus có tốt hơn khi không bị trần lượt che không | F-A9 | E7-R2 đăng ký lại với trần lượt cao hơn (thay hạng 7 của §0.1 (b)) | R2 có 0 lượt không đọc được do trần; recall và chặn nhầm có CI | recall, chặn nhầm, USD | B-42 |
| **TN3** | Reviewer kết luận đúng không | scorecard 1b "độ đúng của kết luận: không có số" | Bộ review có đáp án (mở rộng bộ lỗi cài B-12), cùng trần lượt, sonnet so với opus; chạy sau FX6 | Có recall/chặn nhầm của reviewer trên ≥ 64 mục mỗi phía (theo cỡ E7) | recall, chặn nhầm | B-43 |
| **TN4** | Điều phối viên định tuyến đúng không | Chưa có KPI; `model-per-role.md` | Bộ nhãn phòng đúng do người gán, phát lại `route` haiku và sonnet (không chạy nhiệm vụ) | Tỉ lệ định tuyến đúng có CI cho hai model | tỉ lệ đúng, tỉ lệ lùi `keywordRoute` | B-44 |
| **TN5** | Chọn làn bằng đếm regex có phân loại nhầm không | L10: `lane.ts:55-75` | Phát lại `chooseLane` (mã, không LLM) trên tập đề bài đã gán làn đúng; đối chiếu `lane` với `score`/`fixRounds` trong runs | Ma trận nhầm làn; số đề bị đếm thừa "phần" vì danh sách tiêu chí | tỉ lệ nhầm làn | B-45 |
| **TN6** | Vì sao phòng Dev vượt đường găng 8,1 % (q3 23,3 %) | L6, L7, F-E6; `effectiveness.md` 3a | Thêm vào `decomp-metrics.mjs` phân rã thời gian chờ: chờ người nhận bận (L6), chờ gộp, setup worktree, chạy độc quyền (L7) | Bảng tỉ trọng nguyên nhân trên ≥ 35 lượt Dev | vượt đường găng theo nguyên nhân | B-46 |
| **TN7** | Tiêu chí CTO trượt là lỗi của agent nào | F-A2 | Sửa `src/kpi.ts` để gán tiêu chí cho hạng mục và agent qua `dependsOn`/deliverable, rồi tính lại | `acceptance-fail` tách theo agent, không gán đều cho mọi người | KPI `outcome` theo agent | B-47 |
| **TN8** | Bench thiếu trường để đo chia việc | F-M2: 36/632 lượt có `subtasksTimed` | Đợt bench mới (khi giám đốc mở) ghi `lane`, `subtasksTimed`, `maxConcSubtasks` ở mọi arm CCoding | 100 % lượt CCoding mới có đủ trường | đếm trường trong `runs.jsonl` | B-48 |
| **TN9** | Sau khi Dev sửa xong, điểm và chỗ fail đổi thế nào | toàn bộ FX1–FX21; F-A7 (`devops` n=2), F-E6 (xung đột gộp) | **Chấm lại** theo `run-plan.md` §10.2: KPI 30 ngày mới, `decomp-metrics.mjs`, `scorecard.mjs --check`, phát lại ba ca 14/11 bằng test không gọi LLM | Mỗi FX có tiêu chí xong đạt hoặc ghi lý do; F-A7 và F-E6 có n đủ để ghi mức bằng chứng ≥ medium | các cột của `scorecard.md` | B-49 |

---

## 7. Kết quả theo hạng mục của gói BRIEF-22

| Mã | Hạng mục | Phụ trách | Đạt? (theo review) | Tệp |
|---|---|---|---|---|
| K1 | Engine và logic từng agent | @methodologist | Chờ K7 | `analysis/decisions/logic-map.md` |
| K2 | Bảng điểm, chỗ fail, hiệu quả chia việc | @data-scientist | Chờ K7; `scorecard.mjs --check` exit 0 (K2 báo) | `scorecard.mjs`, `scorecard.md`, `effectiveness.md` |
| K3 | Đối chiếu tài liệu | @literature-researcher | Chờ K7 | `context/decomposition-sources-2026-11-14.md` |
| K4 | Model theo vai, E9 | @methodologist | Chờ K7 | `model-per-role.md`, `preregistration.md` §9.x |
| K6 | Báo cáo này, backlog, run-plan | @research-lead | Chờ K7; phần chèn backlog/run-plan đã vào tệp đích ở BRIEF-22b K1 (mục 8) | `report.md`, `improvement-backlog.md` (§0.2, B-20…B-49), `run-plan.md` (§10) |

## 8. Phương pháp và giới hạn

- **Phân vai** đọc từ mã ở `b146b87c`, đọc tĩnh, chưa chạy.
- **Số liệu** chép từ bảng do script sinh của K2. Không tính lại.
- **Hai chỗ lệch nhỏ giữa báo cáo bàn giao và tệp:**
  - Báo cáo bàn giao của K2 ghi "28 lượt bị cắt trên 124". Bảng `scorecard.md` (do script sinh) cho 27/112. Báo cáo này dùng số của bảng.
  - Vị trí `chooseLane` ghi `lane.ts:130` (K1) và `lane.ts:129` (K2). `:129` là dòng khai báo hàm, `:130` là dòng đầu thân hàm; báo cáo này dùng `:129` (đã sửa ở BRIEF-22b).
- **Ca 14/11:** chỉ n = 3, lấy từ biên bản người điều phối, không có trong `runs.jsonl`. Không suy ra tỉ lệ chung.
- **Văn phòng phụ** chỉ có 5 lượt phòng. KPI có 4 agent mức `low`.
- **Ngưỡng** ghi "(đề xuất)" ở mục 6 chưa được giám đốc duyệt.
- **Việc chèn vào `improvement-backlog.md` (≈ 165 KB) và `run-plan.md` (≈ 87 KB):** ở BRIEF-22 K6 vai chỉ có công cụ ghi đè cả tệp nên phần thêm nằm trong hai tệp chèn có điểm neo. Ở BRIEF-22b K1 (14/11/2026) đã chèn nguyên văn:
  - `improvement-backlog.md`: dòng cập nhật R19 (đầu tệp), §0.2, B-20…B-49 (§5). `git diff --numstat`: 366 dòng thêm, 0 xóa.
  - `run-plan.md`: dòng cập nhật, dòng Tóm tắt, §10. `git diff --numstat`: 68 dòng thêm, 0 xóa.
  - Hai tệp chèn thôi làm nguồn; người điều phối xóa bằng `git rm` vì vai này không có quyền xóa tệp.
- **Data Protection Gate:** gói chỉ thêm tài liệu và chỉ số tổng hợp, không đổi luồng dữ liệu, nên không cập nhật `docs/data-protection-assessment.md`. FX21 (ký số log) là việc theo đúng yêu cầu "log làm chứng cứ phải bất biến" của khung.

## 9. Phản biện đã xử lý

Chưa có: K7 (@peer-reviewer) chạy sau hạng mục này. Phát hiện mức chặn sẽ được sửa ở pha revise, và báo cáo K7 lưu tại `context/k7-brief22-review-2026-11-14.md`.

## 10. Bước tiếp theo

1. **Dev (đang chạy):** D17, sau đó D16b, đóng FX1, FX3, FX5 (a), FX6, FX7 (`run_command`).
2. **Dev (gói mới đề xuất, "D18 lỗi vặt"):** FX2, FX4, FX5 (b), FX7 phần còn lại, FX14, FX15, FX16, FX17, FX18. Đây đều là thay đổi nhỏ có test xác định.
3. **Dev (gói sau, cần chẩn đoán trước):** FX8, FX9, FX10, FX11, FX12, FX13. FX21 cần giám đốc chọn hạ tầng lưu trữ.
4. **Phòng Nghiên cứu:** FX19, FX20 (script trong `docs/research/scripts/`); TN6 (mở rộng `decomp-metrics.mjs`); chèn hai tệp chèn vào backlog và run-plan.
5. **Cần giám đốc duyệt:** ngân sách và hai người gán chuẩn cho E9 (TN1); chi phí Opus cho TN2; người gán nhãn cho TN3, TN4; các ngưỡng "(đề xuất)".
6. **Chấm lại (TN9)** sau khi Dev gộp xong mọi FX thuộc Dev, theo `run-plan.md` §10.2.

## Tài liệu tham khảo

Nội bộ: `analysis/decisions/logic-map.md`, `scorecard.md`, `effectiveness.md`, `model-per-role.md`; `preregistration.md` §9.x (E9); `bench/vs-claude/results/{decisions,e7-cto,e8-parallel,p-parallel,g-mutation,axis2-guard}/`; `docs/research/BRIEF-D16b.md`, `BRIEF-D17.md`; `improvement-backlog.md` §0.1.

Ngoài (danh mục đầy đủ và cách kiểm ở `context/decomposition-sources-2026-11-14.md`):
- S1. Kim và cs., *Towards a Science of Scaling Agent Systems*, arXiv 2512.08296 (preprint). https://arxiv.org/html/2512.08296v1
- S4. Prasad và cs., *ADaPT*, Findings NAACL 2024. https://ar5iv.labs.arxiv.org/html/2311.05772
- S5. Dong và cs., *PEAR*, arXiv 2510.07505 (preprint). https://arxiv.org/abs/2510.07505
- S6. Ong và cs., *RouteLLM*, ICLR 2025. https://arxiv.org/html/2406.18665v3
- S10. Crupi và cs., *On the Effectiveness of LLM-as-a-judge for Code Generation and Summarization*, arXiv 2507.16587 (preprint). https://arxiv.org/html/2507.16587v1
