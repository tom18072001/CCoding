# Đối chiếu tài liệu "4 hướng tăng tốc" (3/11/2026) với bằng chứng benchmark

> Phòng Nghiên cứu · T-20261103-115014-174, hạng mục S3 (@research-lead) · 3/11/2026 · phân loại dữ liệu: **Nội bộ**, không có DLCN.
> Đầu vào: `docs/research/context/acceleration-4-directions-2026-11-03.md` (gọi tắt **TL**; 8 đề xuất ở mục "Đề xuất cải tiến", dòng 255–300), `analysis/cache-sensitivity.md` (S1, bảng **C-0…C-5**), `analysis/cache-diagnostic-spec.md` (S2), `related-work.md` §2.16–2.22 (S4), `analysis/b7-cost-decomposition.md` (**T-0…T-7**), `analysis/agreement.md` (§(c)), `analysis/variance-decomposition.md` (**V-0…V-4**), `improvement-backlog.md` (B-01…B-12).
> **Dữ liệu:** mọi số benchmark lấy từ ảnh chụp `838a5f1` (276 dòng, C-0) hoặc từ các tệp phân tích đã có (T-x dùng 221 dòng đầu, V-x dùng 240 dòng). Tệp này **không** đọc `runs.jsonl` hiện tại, các dòng `study-cloud` sau `838a5f1` hay `results/b7prime`.
> **Thước đo chính** về chi phí vẫn là công thức của giám đốc `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`. Hệ số 0,05 (C-4) và USD (C-5) chỉ là phân tích phụ, ngoài họ Holm (`preregistration.md` §9 V4-03).
> **Mã nguồn đối chiếu:** `src/` của nhánh `perf/vs-claude-loop` tại `d3014d0` (`git diff perf/vs-claude-loop HEAD -- src` rỗng, nên dòng `src/…:n` dưới đây là của nhánh đó). TL phân tích `main` tại `9e6079b`; commit này **không có** trong repo đang làm (`git grep … 9e6079b` báo "unable to resolve revision"), nên không đối chiếu được mã của `main`.

## 1. Bảng 8 đề xuất

| # | Đề xuất của TL | Đã có trên `perf/vs-claude-loop`? | Bằng chứng của ta (tệp · bảng) | Ủng hộ / mâu thuẫn | Backlog |
|---|---|---|---|---|---|
| 1 | Đo tỉ lệ trúng cache `cacheRead / (cacheRead + cacheWrite + input)` theo lượt gọi, pha, runtime trên trang Token và KPI v2 | **Chưa.** `src/` và `public/` không có chỉ số này (Grep "cacheHit", "trúng cache": 0 kết quả). Chỉ có số đo ngoài luồng do S1 tính | `cache-sensitivity.md` C-2: gộp A0-sonnet 87,0 %, B0 76,5 %, B6 80,5 %, B7 82,2 %. `b7-cost-decomposition.md` T-2, T-6: `byPhase` chỉ có weighted, không có cacheRead/cacheWrite theo pha, nên chưa tính được tỉ lệ theo pha. C-0: ảnh chụp không có trường `model` | **Ủng hộ** sự cần thiết: không có trường theo pha và model thì không tách được nguồn cache (T-2, C-0). Mức trúng cache của ta đã cao (76,5–87,0 %), khác hình ảnh "ghi lại thay vì đọc lại" của TL | **B-13** (mới) |
| 2 | Kiểm chứng rồi ổn định tiền tố claude-cli; mục tiêu ghi cache < 20 % chi phí | **Chưa.** `claude-cli.ts` truyền `--tools`/`--allowedTools` theo pha (dòng 148, 169, 171) và `cwd` riêng (dòng 183); lời nhắc hệ thống của CCoding đi qua stdin (S2 §1) | C-1: 1,25·cacheWrite chiếm 30,1 % (A0) … 41,7 % (B0) token có trọng số; B7 34,8 %. C-3: ở B7 cacheWrite 37,2 % theo USD; 0 lượt B0/B6/B7 đạt 68 %. T-4: cacheWrite 36,8 % phần chênh B7 − A0. Đặc tả phép thử: `cache-diagnostic-spec.md` Phần 1 | **Ủng hộ một phần.** Cache là thành phần lớn thứ hai (C-3: ghi + đọc 44–52 %), nhưng **mâu thuẫn** với con số 68 % (§2.1). Mục tiêu < 20 % chưa có căn cứ: hiện 30,1–41,7 % (C-1) | **B-14** (mới) |
| 3 | Rút gọn họp: ý kiến vòng đầu song song rồi trưởng phòng chốt, hoặc `discussionRounds: 0` với kế hoạch ≤ 3 hạng mục | **Có một phần.** (i) Họp đã song song trong một vòng: `phases.parallelDiscuss` mặc định bật (`orchestrator.ts:1611-1623`, `Promise.all`). (ii) Họp tự bỏ khi kế hoạch < `meetingMinSubtasks` (mặc định 3) hoặc < 2 người tham gia (`orchestrator.ts:1602-1604`). (iii) Mặc định `discussionRounds: 1` (`config.ts:297`). (iv) Làn đơn B-01 không có họp. **Chưa có:** ngưỡng "≤ 3 hạng mục → 0 vòng" (hiện bỏ họp ở < 3) | Không có số đo họp: arm `B1` (`discussionRounds: 0`) có trong `arms.json:29-35` nhưng **chưa chạy** (S2 Phần 2). B7 là làn đơn, không họp (T-2: chuỗi pha `execute → accept`). Tài liệu: Debate or Vote (`related-work.md` §2.16) | **Chưa đủ bằng chứng** (không ủng hộ, không mâu thuẫn). Câu "chạy nối tiếp 5 lượt" của TL không khớp mã trên nhánh perf (đã song song trong vòng) | **B-15** (mới, đo trước khi đổi) |
| 4 | Đổi model hai bước: tổng hợp → Sonnet, CTO nghiệm thu → Opus | **Cơ chế có, cấu hình chưa.** `phaseModels` theo nhiệm vụ (`types.ts:335-339`, `orchestrator.ts:3234`, lọc ở `:3783-3785`; khóa arm `bench.ts:125`). Chưa có arm hay cấu hình nào đặt `accept: opus` | T-5: pha accept chiếm **47,7 %** phần chênh B7 − A0 trên t1–t5 (cận dưới độc lập 14,5 %). C-5: giá Opus 5.5 đúng 2× Sonnet 5.5 ở mọi thành phần. B-11 (a-brief) rút đầu ra của accept. `agreement.md` §(c) C-1…C-3: recall của CTO chưa ước lượng được (4 và 7 lượt lỗi < 10) | **Mâu thuẫn về chi phí** nếu làm riêng: Opus ở pha lớn nhất làm USD của pha đó ×2 khi số token không đổi. **Chưa có bằng chứng** chất lượng (B-12 chưa chạy). Phương án ghép "CTO Opus + a-brief" ở §2.3 | **B-16** (mới; đi cùng B-11 (a-brief), B-12) |
| 5 | Gộp tổng hợp với nghiệm thu khi nhiệm vụ chỉ có 1 hạng mục | **Có cho làn đơn — B-01.** Làn đơn bỏ định tuyến, kế hoạch, họp và tổng hợp; chuỗi pha B7 là `execute → accept` (T-2; B-11 (d), `orchestrator.ts:1083-1084`). Việc giao riêng cho một agent cũng bỏ lượt tổng hợp (`orchestrator.ts:1875-1891`). **Chưa có** cho làn đầy đủ có kế hoạch 1 hạng mục | T-7: dù đã bỏ tổng hợp, B7/A0 vẫn ×2,51 (C-4: ×2,52 trên ảnh chụp); phần chênh lớn nhất là accept (T-5), không phải tổng hợp | **Ủng hộ hướng**, nhưng tác động đã được hấp thụ ở B-01; phần còn lại nằm ở accept | **đã có — B-01** (phần làn đơn); B-11 cho phần accept |
| 6 | Chọn model lập kế hoạch theo độ khó 1–3 do bước định tuyến chấm | **Có một phần.** Làn nhanh dùng `fastLane.planModel` cho pha plan (`orchestrator.ts:1399`, `:1520`); không có thang độ khó | Không có dữ liệu: ảnh chụp không có trường `model` (C-0), `byPhase` không tách model (T-2). B7 không có lượt plan | **Chưa đủ bằng chứng** | **B-17** (mới, **hoãn** tới khi B-13 ghi model theo pha) |
| 7 | Review từng hạng mục ngay khi xong (kế hoạch ≥ 3 hạng mục) | **Chưa** (review chạy sau khi mọi hạng mục xong) | Không có dữ liệu benchmark về kế hoạch ≥ 3 hạng mục: bài lớn `l1-modules`, `l2-chain` chưa có `task.json` (S2 Phần 2). TL tự ghi "chỉ làm nếu bước 1–3 xong mà thời gian vẫn là vấn đề" | **Không đánh giá được** | **Không mở mã** — xét lại sau B-15 |
| 8 | Cache 1 giờ cho nhiệm vụ có bước duyệt kế hoạch (chỉ runtime API) | **Chưa.** Runtime API gắn `cache_control: { type: 'ephemeral' }` không có `ttl` (`api.ts:40-41`, `:760-761`), tức TTL mặc định | Benchmark chạy claude-cli, không chạy runtime API: không có số đo. C-5 (gián tiếp): Σ `costUsd` A0-sonnet $14,43 khớp giá Sonnet 5.5 với cacheWrite **1 giờ**, không khớp giá 5 phút ($12,06) — gợi ý claude-cli **đã** ghi cache 1 giờ (chỉ A0, giả định A0 chạy Sonnet 5.5) | **Không đánh giá được** cho runtime API. Với claude-cli, câu hỏi ngược lại: nếu đang ghi 1 giờ (2× giá đầu vào) cho lượt gọi cách nhau < 5 phút thì có thể đang trả thừa — gộp vào B-14 | **Không mở mã riêng**; câu hỏi TTL claude-cli nằm trong **B-14** |

Truy vết: mỗi dòng trỏ về ít nhất một bảng (C-x, T-x, V-x) hoặc một dòng mã/tệp; dòng 7 trỏ về S2 Phần 2 và TL dòng 289–291.

## 2. Đối chiếu kỹ

### 2.1 Cache: 68 % của TL so với C-1…C-3

| Nguồn | Phạm vi | Mẫu số | cacheWrite | cacheRead | out |
|---|---|---|---:|---:|---:|
| TL | 1 nhiệm vụ thật, 5 lượt gọi | "chi phí", không nêu bảng giá | ≈ 68 % | — | — |
| T-4 | phần chênh B7 − A0, t1–t5, 221 dòng | weighted 0,1 | 36,8 % | 12,8 % | 50,4 % |
| C-3 | cách T-4 trên ảnh chụp 276 dòng | weighted 0,1 | 36,5 % | 12,5 % | 51,0 % |
| C-1 | B7 gộp lượt, mọi bài | weighted 0,1 | 34,8 % | 12,9 % | 52,3 % |
| C-3 | B7 gộp lượt | USD Sonnet 5.5, cacheWrite 5 phút | 37,2 % | 6,9 % | 55,9 % |
| C-3 | phân bố theo lượt, tỉ trọng cacheWrite (USD) | USD | max B7 53,8 %, B0 54,2 %; A0 1/101 lượt ≥ 68 % | | |
| C-2 | tỉ lệ trúng cache gộp | `cacheRead / (cacheRead + cacheWrite + input)` | A0 87,0 % · B0 76,5 % · B6 80,5 % · B7 82,2 % | | |

**Lý giải chênh lệch** (theo C-3, diễn giải của S1):
1. **Mẫu số.** T-4 đo phần *chênh*; C-1 đo *tổng*; TL đo một nhiệm vụ. Trong cả hai thước đo của ta, out nhân 5 nên chiếm 51–52 %.
2. **Hình dạng nhiệm vụ.** 68 % xảy ra khi lượt chạy có ít out so với tiền tố mới ghi (TL: 5 lượt, 7–26k token ghi mỗi lượt). Trong benchmark chỉ 1/101 lượt A0 đạt mức đó, 0 lượt của B0/B6/B7.
3. **Định nghĩa "ghi cache".** Nếu TL tính cả cacheWrite + cacheRead thì số của ta là 44–48 % (gộp); tỉ trọng này theo lượt chưa tính.
4. **Đơn vị.** Nếu claude-cli ghi cache 1 giờ (C-5, gián tiếp) thì tỉ trọng cacheWrite theo USD cao hơn cột 5 phút ở trên; chưa tính.

**Kết luận (mức chắc chắn: vừa).** Bằng chứng của ta **không ủng hộ** "cache chiếm 68 %" như đặc điểm chung, nhưng **ủng hộ** "cache là thành phần lớn thứ hai sau out". Câu "ghi lại thay vì đọc lại" cũng không khớp: tỉ lệ trúng cache 76,5–87,0 % (C-2). B0 có tỉ lệ thấp nhất và tỉ trọng cacheWrite cao nhất (41,7 %), nhất quán với giả thuyết "nhiều pha, mỗi pha một bộ công cụ ⇒ vỡ tiền tố" của S2, nhưng chưa kiểm (các arm có tập bài khác nhau). C-4: đổi hệ số cacheRead sang 0,05 chỉ đổi B7/A0 t1–t5 ×2,52 → ×2,55 (+1,3 %), B6/A0 ×3,93 → ×4,03 (+2,5 %), nên kết luận không phụ thuộc hệ số này.

### 2.2 Họp: điều kiện đo arm B1 (từ S2 Phần 2)

- B1 = `discussionRounds: 0`, `arms.json:29-35`, chưa chạy.
- Họp chỉ xảy ra ở **làn đầy đủ**, kế hoạch ≥ `meetingMinSubtasks` (3) hạng mục **và** ≥ 2 người tham gia ngoài trưởng phòng (`orchestrator.ts:1602-1605`); làn nhanh không họp. Bài t1–t5 chạy làn đơn ở B7 nên không đo được họp.
- **Tiên quyết:** bài lớn `l1-modules`, `l2-chain` mới có `starter/`, **chưa có `task.json`**. Gói này không sửa `bench/`; tạo `task.json` là quyết định của giám đốc.
- **Kiểm trước:** lượt đối chứng (B0 hoặc làn đầy đủ mặc định) phải thật sự có pha `discuss`. Không có họp ở đối chứng thì kết quả rỗng, không phải âm.
- **Cỡ mẫu tham chiếu:** 10 lượt × arm × bài, 2 bài, 2 arm = 40 lượt + 6 lượt thí điểm. Phương án A của V-2 cho nửa độ rộng CI 90 % 0,218 với 5 bài; với 2 bài sẽ rộng hơn, chưa mô phỏng (S2).
- **Nhận xét:** câu "họp chạy nối tiếp 5 lượt" của TL mô tả `main@9e6079b`; trên nhánh perf, phát biểu trong một vòng đã song song (`parallelDiscuss`). Lợi ích còn lại của "tắt họp" là bỏ 1 vòng song song + 1 lượt chốt trên đường găng. Đề xuất "ý kiến vòng đầu song song rồi chốt" của TL **đã là** hành vi mặc định khi `discussionRounds: 1`.

### 2.3 Model theo pha: "CTO Opus + nghiệm thu brief"

- **Dữ kiện.** Pha accept chiếm 47,7 % phần chênh B7 − A0 trên t1–t5 (T-5; đề bài ghi T-4, nhưng số này nằm ở T-5 và T-7 của `b7-cost-decomposition.md`, T-4 là phân rã theo thành phần). Cận dưới độc lập 14,5 %. Opus 5.5 đắt đúng 2× Sonnet 5.5 mỗi thành phần (C-5).
- **Hệ quả.** Chỉ đổi accept sang Opus thì USD của pha accept ×2 khi token không đổi, đi ngược mục tiêu B-01′ ×1,3 (B-11.4). Token có trọng số **không so trực tiếp** được giữa hai model khác giá (S2 Phần 3), nên kết luận chi phí dùng USD, ghi là phân tích phụ.
- **Phương án ghép.** Opus ở pha accept + (a-brief) của B-11 (CTO trả bảng tiêu chí ngắn): a-brief cắt out của accept, Opus bù chất lượng phán đoán. Hai arm chỉ khác model của pha accept, cùng a-brief (S2 Phần 3).
- **Cách đo (B-12).** Bộ bài cài lỗi; chỉ số chính là **tỉ lệ nghiệm thu sai** (CTO "đạt" khi lỗi cài còn nguyên), ghép cặp, McNemar + Clopper–Pearson. Phụ: token có trọng số (thước đo chính về chi phí), USD, thời gian, test ẩn. Cỡ mẫu một arm 25–46 lượt lỗi cài (`agreement.md` C-3, B-12 trường 5); cỡ mẫu ghép cặp cần thí điểm 12 cặp để ước lượng ρ, q.
- **Điều kiện:** giám đốc duyệt (a-brief) (B-11) **và** mở đo B-12; Phòng Dev xác nhận tên pha trong `phaseModels` (`VARIANT_PHASES` có `accept`, `orchestrator.ts:3776`) và thêm trường ghi quyết định của CTO (B-12 trường 4(c)).

## 3. Chênh lệch giá và ngưỡng giữa S4 và S1/S2

| Mục | S1 (`cache-sensitivity.mjs` `PRICES`) | S2 (`MIN_CACHE_TOKENS`) | S4 (`related-work.md`, khối "Giá và ngưỡng đã kiểm") | Xử lý |
|---|---|---|---|---|
| Giá Sonnet 5.5 (input / ghi 5 phút / ghi 1 giờ / đọc / output, USD/MTok) | 2 / 2,5 / 4 / 0,1 / 10 | — | 2 / 2,50 / 4 / 0,10 / 10 | **Khớp** |
| Giá Opus 5.5 | 4 / 5 / 8 / 0,2 / 20 | — | 4 / 5 / 8 / 0,20 / 20 | **Khớp** |
| Mức kiểm chứng giá | `verified=true`, trang pricing | — | Trang pricing mở được nhưng không trích riêng được dòng 5.5; xác nhận qua trang prompt-caching | **Lệch về mức kiểm, không lệch về số.** Hai lần truy cập độc lập cùng ngày, hai trang của cùng một nhà cung cấp cho cùng số. Giữ C-5 không nhãn; ghi là "một nguồn chính thức" |
| Ngưỡng token tối thiểu Sonnet/Opus 5.5 | không đọc được | **[CHƯA KIỂM CHỨNG]**, cỡ 1 024–4 096 (theo thế hệ trước) | **512** cho nhóm model 5.5 (trang prompt-caching) | **Lệch.** Dùng 512 của S4. Không đổi thiết kế S2: quy tắc "tiền tố ≥ max(MIN_CACHE_TOKENS) + 20 %" thỏa với cả hai giá trị vì ngữ cảnh nền của Claude Code ≈ 7,6k (`claude-cli.ts:173`); lượt khởi động vẫn đo thật |
| TTL claude-cli | gián tiếp 1 giờ (C-5, chỉ A0) | ≤ 60 s giữa hai lượt, < TTL 5 phút | TTL 5 phút, "làm mới miễn phí" **[CHƯA KIỂM CHỨNG]** | Suy luận 1 giờ là gián tiếp: mang nhãn [CHƯA KIỂM CHỨNG] trong B-14 |

Không mục nào trong backlog dùng giá chưa kiểm. Số dựa trên TTL 1 giờ mang nhãn [CHƯA KIỂM CHỨNG].

## 4. Ba đề xuất đầu cho Phòng Dev

> **Không đưa lên `main`.** Cả ba làm trên nhánh `perf/vs-claude-loop` hoặc nhánh con; việc đưa lên `main` do giám đốc quyết. Không đề xuất nào đổi thước đo chính.

| # | Mã | Việc | Tiêu chí xong | Cách đo |
|---|---|---|---|---|
| 1 | **B-14** | **Chẩn đoán cache claude-cli** theo `cache-diagnostic-spec.md` Phần 1: 3 cặp gọi `claude -p` đúng cờ runtime dùng (`claude-cli.ts:144-188`) — (a) giống hệt, (b) khác bộ công cụ, (c) khác `cwd` (đối chứng) — tổng ≤ 8 lượt (6 đo + 1 khởi động + 1 dự phòng) | Có bảng `usage` lượt 2 của mỗi cặp (`cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`, tỉ lệ trúng h) và phán đoán nguồn ghi cache theo bảng quy tắc của S2; ghi thêm TTL thật (5 phút hay 1 giờ) từ trường usage nếu có | So h của (b), (c) với (a) theo ngưỡng diễn giải của S2; không p-giá trị (n = 1 mỗi cặp) |
| 2 | **B-13** | **Chỉ số trúng cache và trường ghi bổ sung**: tỉ lệ trúng cache theo lượt gọi, pha, runtime trên trang Token/KPI v2; `runs.jsonl` ghi `model` và `byPhase[phase].{input,cacheRead,cacheWrite,output}` | Trang Token hiện chỉ số; tính lại offline trên một tệp `calls.jsonl` cho cùng số với UI (sai số ≤ 0,1 điểm %); dòng `runs.jsonl` mới có `model` và `byPhase` đủ 4 thành phần; test đơn vị xanh | Tái lập C-2 bằng trường mới trên lượt mới; kiểm `node docs/research/scripts/consistency-check.mjs` |
| 3 | **B-16** | **Thí điểm "CTO Opus + a-brief"** (chỉ sau khi giám đốc duyệt (a-brief) của B-11 và mở đo B-12): hai arm chỉ khác `phaseModels.accept`, cùng a-brief | 12 cặp thí điểm trên bài cài lỗi B-12 có quyết định CTO được ghi; ước lượng ρ, q và tỉ lệ bất đồng; cỡ mẫu chính thức được tính và ghi `preregistration.md` §9 trước lượt chính | Tỉ lệ nghiệm thu sai (McNemar, CI Clopper–Pearson); phụ: USD, token có trọng số, thời gian, test ẩn; dừng theo 5 điểm dừng của S2 Phần 3 |

Thứ tự: B-14 và B-13 độc lập, có thể song song; B-16 chờ hai duyệt của giám đốc. B-15 (họp) không vào top 3 vì bị chặn bởi `task.json` của bài lớn.

## 5. Giới hạn

- TL dựa trên 1 nhiệm vụ thật; ta không có log của nhiệm vụ đó (`T-20261103-104812-fc1`), nên không kiểm được "7–26k token ghi mỗi lượt" (S1 §Giới hạn).
- Không đối chiếu được mã `main@9e6079b` (commit không có trong repo này); mọi nhận định "đã có" là của nhánh perf.
- Các arm có tập bài khác nhau (C-1, C-2 là mô tả); B6 chỉ có 5 bài chung với A0 (C-4).
- C-5 là hai kịch bản cận (toàn Sonnet / toàn Opus), không phải chi phí thực, vì ảnh chụp không có `model`.

## 6. Kiểm lại

`node docs/research/scripts/consistency-check.mjs` (data-scientist chạy ở pha kiểm tra) và `node docs/research/analysis/cache-sensitivity.mjs --check docs/research/analysis/cache-sensitivity.md`.
