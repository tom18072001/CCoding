# S4 — Kế hoạch thí nghiệm bổ sung (T-20261102-112755-181)

- Trạng thái: **kế hoạch**. Không chạy `run.mjs`, không chạy benchmark, không sửa `src/`, `agents/`, `bench/` hay `ccoding.config.json`. Chỉ có `estimate.mjs` được chạy.
- Tái lập mọi bảng ước lượng: `node docs/research/dev-review/estimate.mjs` (exit 0; đọc `bench/vs-claude/results/runs.csv` và `docs/research/performance/c6-extract/C6-runs.csv`). Số trong tệp này là đầu ra của lệnh đó lúc viết (57 lượt `done`).
- Mục tiêu: đóng các điều kiện D1–D5 trong `publication-plan.md` trước hạn **FSE 2027 Industry, 23/1/2027** (hạn lấy từ `publication-plan.md`, chưa kiểm lại ở nguồn gốc).

## 1. Dữ liệu nền (E-1) và số lượt cần (E-2)

Mốc so sánh: C5+C6, Claude Code (opus) và CCoding làn nhanh (sonnet), chỉ lượt `done`. Mean ± sd, thời gian giây, chi phí USD (đầy đủ token vào/ra/đọc/ghi cache: chạy lệnh trên, bảng E-1).

| Bài | Hệ | n | Thời gian (s) | Chi phí (USD) |
|---|---|---:|---:|---:|
| t1-duration | Claude Code | 2 | 126 ± 12 | 0,513 ± 0,062 |
| t1-duration | CCoding làn nhanh | 2 | 107 ± 13 | 0,542 ± 0,209 |
| t2-orders | Claude Code | 2 | 91 ± 3 | 0,436 ± 0,040 |
| t2-orders | CCoding làn nhanh | 2 | 106 ± 40 | 0,690 ± 0,189 |
| t3-api | Claude Code | 4 | 205 ± 55 | 0,878 ± 0,197 |
| t3-api | CCoding làn nhanh | 4 | 296 ± 190 | 1,121 ± 0,140 |
| t4-perf | Claude Code | 2 | 203 ± 23 | 0,627 ± 0,034 |
| t4-perf | CCoding làn nhanh | 2 | 153 ± 27 | 0,574 ± 0,020 |
| t5-logq | Claude Code | 4 | 259 ± 21 | 1,012 ± 0,079 |
| t5-logq | CCoding làn nhanh | 4 | 174 ± 34 | 1,149 ± 0,164 |

Hai điều phải nói trước khi dùng bảng:
- sd tính từ n = 2–4 nên bản thân rất không chắc; số lượt bên dưới là **cỡ mẫu sơ bộ**, phải tính lại sau khi có 6 lượt đầu (gói A).
- `t3` làn nhanh có một lượt treo stdin 579 s (C5, rep 1) làm sd = 190 s. E-2 tính cả hai cách; cách bỏ lượt treo là phân tích độ nhạy **hậu nghiệm**, phải khai báo như vậy.

**Công thức đã chốt:** n = 2·(z₁₋α/₂ + z₁₋β)²·σ²/Δ² mỗi hệ, α = 0,05, power = 0,8 (z = 1,96 và 0,84), σ = sd gộp của hai hệ trong ô, Δ = 20 % (hoặc 10 %) trung bình Claude Code. Δ là **giả định** về mức chênh có ý nghĩa thực tế; cần Tom/thầy chốt trước khi chạy.

Kết quả (thời gian, Δ = 20 %; chi tiết đủ ô + Δ = 10 % + Δ quan sát ở E-2): mỗi ô cần 4–38 lượt/hệ; giữ lượt treo thì `t3` cần 183. Ô chi phí cần 1–39 lượt ở Δ = 20 %. Quyết định:
- Chốt **6 lượt/hệ/ô** cho gói MVP (đáp ứng yêu cầu ≥ 6) và **12** cho gói mở rộng (trần ngân sách; n công thức của vài ô vượt 12 nên các ô đó vẫn thiếu lực ở Δ = 20 %: báo khoảng tin cậy và kích thước hiệu ứng, không báo "không khác biệt").
- Đối chiếu S1 (`requiredRuns` trong `stats.mjs`): nếu lệch quá 1 lượt/ô thì S5 lấy số của S1. Tệp S1 chưa có trong worktree này nên **chưa đối chiếu được**.

## 2. Giả định chi phí (nguyên văn dùng lại cho S5)

| Mục | Giá trị | Ghi chú |
|---|---|---|
| Nguồn chính | cột `cost_usd` quan sát được trong `runs.csv` và `C6-runs.csv` | ngoại suy theo trung bình mỗi lượt từng hệ (C5+C6: Claude 0,765 USD/192 s; CCoding làn nhanh 0,907 USD/187 s) |
| Giá Sonnet (USD/triệu): vào / ra / đọc cache / ghi 5 phút / ghi 1 giờ | 3 / 15 / 0,30 / 3,75 / 6,0 | **GIẢ ĐỊNH**, chưa tra lại ngày 2/11/2026 (lượt này không truy cập web) |
| Giá Opus (USD/triệu), cùng thứ tự | 5 / 25 / 0,50 / 6,25 / 10,0 | **GIẢ ĐỊNH**, như trên |
| TTL ghi cache | Claude Code 1 giờ, CCoding 5 phút | theo T-0 trong `token-analysis.md` (Claude 1 giờ); phía CCoding là giả định |
| Hiệu chuẩn | USD quan sát / USD bảng giả định = 0,71 (Claude), 0,75 (CCoding) | bảng giả định **cao hơn** thực tế ~30 %; vì vậy kịch bản đổi model nhân tỉ lệ bảng giả định với USD quan sát chứ không dùng USD bảng thô |
| Đổi model | token không đổi | thực tế Sonnet có thể dùng nhiều lượt hơn Opus; chưa đo |
| Bài lớn (40 phút) | wall = 40 phút; USD ∝ wall × 1,5 | 1,5 = hệ số siêu tuyến tính do ngữ cảnh phình (giả định) |
| SWE-bench | wall × 2, USD × 1,5 so với bài t1–t5 | giả định; chưa chạy thử |
| Overhead | 60 s/lượt | chấm test ẩn, dựng/dọn repo (chưa đo) |

Hệ quả: các ước lượng USD chỉ đúng bậc độ lớn (±50 % hoặc hơn). Trước khi chạy gói C và D nên chạy **1 lượt thử mỗi hệ** để đo thật, rồi chạy lại `estimate.mjs` với ASSUME đã sửa.

## 3. Ma trận thí nghiệm

Quy ước chung cho mọi gói: Claude Code và CCoding chạy **cùng lúc** từng cặp (như C6) để chung nhiễu thời điểm; ghi cấu hình (config JSON đã ẩn khóa, commit CCoding, phiên bản `claude`, commit harness) và seed vào thư mục `results/<run>/MANIFEST.json`; thứ tự lượt ngẫu nhiên xen kẽ bằng seed ghi sẵn (xem §7 H1 — hiện `run.mjs` xếp rep → bài → hệ cố định, không xáo).

| Mã | Câu hỏi/điều kiện | Biến thao tác | Cố định | Bài | Lượt | Hệ | Ghi chú |
|---|---|---|---|---|---:|---|---|
| (a) A | D2: tách hiệu ứng mô hình | hệ (Claude Code vs CCoding làn nhanh) | **mô hình = Sonnet cả hai** (`baselineModel: "sonnet"`; làn nhanh đã dùng Sonnet mọi pha, token-analysis C5) | t1–t5 | 6 (MVP) + 6 (A+) /hệ/ô | claude, ccoding-fastlane | 60 + 60 lượt |
| (a) A2 | như trên, mô hình đắt | như trên | Opus cả hai | t1–t5 | 6 | claude, ccoding-fastlane (phase models = opus) | mở rộng; cần xác nhận cách ép Opus mọi pha ở CCoding (chưa kiểm cấu hình) |
| (c) C | D4: khi nào multi-agent nhanh hơn | hệ | Sonnet cả hai | L1, L2 (§4) | 6 | claude, ccoding-fastlane | 24 lượt; nâng `claudeTimeoutMin`, `ccodingTimeoutMin` ≥ 90 |
| (c) C3 | D4 "≥ 3 bài" | hệ | như C | L3 | 6 | như C | mở rộng |
| (d) D | D4: SWE-bench Verified | hệ | Sonnet cả hai | 20 instance (§5) | 1 | claude, ccoding-fastlane | 40 lượt; cần adapter chấm (H4) |
| (d) D2 | mở rộng | hệ | như D | +40 instance | 1 | như D | 80 lượt |
| (e) E | D5: runtime khác | runtime | làn nhanh, cùng prompt | t2, t3, t5 | 3 | ccoding-fastlane trên `anthropic-api` và `codex-cli` | 18 lượt; không có đối chứng Claude Code ở runtime khác nên chỉ nói về CCoding |
| (f) F1 | RQ5: P1–P3 thăm dò | nhánh A (gốc), B1 = P1, B2 = P2, B3 = P3 | làn nhanh Sonnet; **A dùng chung** | t1–t5 (bộ phát triển) | 3 | 4 nhánh | 60 lượt |
| (f) F2 | RQ5: xác nhận | như F1 | như F1 | t1–t5 | 6 | 4 nhánh | 120 lượt |
| (f) F3 | RQ5: giữ lại | A + ≤ 2 bản vá thắng F2 | như F1 | t6–t8 (viết **sau khi chốt bản vá**) | 6 | 3 nhánh | 54 lượt, dùng **một lần** |

Về (e): runtime chỉ lấy trong `docs/RUNTIMES.md`: `claude-cli` (đã có), `anthropic-api`, `codex-cli`; còn `kimi-cli`, `openai-api`, `bifrost`, `ollama` để ngoài vì chưa có lý do khoa học rõ (và `ollama` còn bị giới hạn mô hình cục bộ). `design.md` §Đe dọa yêu cầu ít nhất một runtime kiểu API khác vì cache khác ở runtime khác; `anthropic-api` đáp ứng điều đó. Với (f): P1–P3 áp bằng `git apply --unidiff-zero --ignore-whitespace` vào các bản dựng CCoding riêng (cổng riêng, `_url` trong `variants`), mỗi nhánh một cổng; các hạng mục khác đã ghi các `--check` xem `verification.md`.

Đo A/B theo `design.md` §5.3: ngưỡng khai báo trước (an toàn ≥ −2 điểm %; token cận trên log-tỉ số < log 0,95; thời gian không tăng quá 5 %), Holm trên ba chỉ số. Việc dùng chung nhánh A cho cả ba bản vá giảm từ 90/180 lượt (3 bản vá × 2 nhánh) xuống 60/120.

## 4. Bài lớn > 15 phút (c)

Không dùng dự án A, không dữ liệu thật, không tên nội bộ. Toàn bộ dữ liệu sinh tổng hợp, miền chung (kho, lịch, trình biên dịch nhỏ), tên bài trung tính (L1–L3).

| Bài | Mô tả | Vì sao lớn | Test ẩn |
|---|---|---|---|
| L1 | Hệ quản lý kho/đơn hàng nhiều module: nhập tệp, kiểm hợp lệ, lưu trữ, tồn kho, giá/khuyến mãi, báo cáo, CLI, API | ~8–10 module khá độc lập → nơi giả thuyết "chia việc song song" có cơ hội thắng | ≥ 250 test theo module + vài test tích hợp |
| L2 | Trình thông dịch DSL nhỏ: lexer, parser, kiểm kiểu, tối ưu, evaluator, định dạng, thư viện chuẩn | các khâu **phụ thuộc nhau** → đo giới hạn song song, đối chứng với L1 | ≥ 250 test, tách theo khâu |
| L3 (mở rộng) | Chuyển đổi/di trú đa tệp: đổi API nội bộ, cập nhật mọi nơi gọi | việc "tản" nhiều tệp, hợp reviewer độc lập (P3) | ≥ 200 test + vài test gieo lỗi ngoài diff |

Cách viết test ẩn: (1) viết đặc tả bằng văn bản như `prompt.txt` của t1–t5; (2) viết lời giải tham chiếu `ref/` trước; (3) viết test ẩn từ đặc tả (không từ `starter`) rồi chạy `bench/vs-claude/harness/validate.sh` kiểu hiện có: `ref` phải qua 100 %, `starter` phải rớt; (4) kiểm đột biến thủ công (sửa nhỏ `ref`, ít nhất 20 đột biến phải làm rớt test); (5) test ẩn nằm ngoài repo mà agent truy cập (như `test-hidden/` hiện nay, chỉ chép khi chấm). Người viết test ẩn không được là agent chạy trong lượt đo. Ẩn danh: bài và test không chứa tên người, tổ chức, dự án; rà bằng tìm kiếm chuỗi nội bộ trước khi đưa lên kho công khai; lượt đo ghi qua `LogStore` che PII như thường. Công sức viết bài (chưa tính ở đây): ước 1–2 ngày/bài, **giả định**.

## 5. Tập con SWE-bench (d)

| Mục | Đề xuất |
|---|---|
| Tập | SWE-bench Verified (500 instance đã được người kiểm). Dùng Verified chứ không Lite vì nhãn "giải được" đáng tin hơn (Lite 300 instance, chưa lọc thủ công) — hai con số này lấy từ trí nhớ, **cần tra lại** trước khi trích |
| Tiêu chí chọn | (1) phân tầng theo kho, ≤ 3 instance/kho; (2) nửa số instance gold patch sửa ≥ 2 tệp, nửa còn lại 1 tệp (để thấy multi-agent thua/thắng ở đâu); (3) loại instance chạy test > 5 phút hoặc cần mạng; (4) loại instance mà image Docker không dựng được; (5) bốc ngẫu nhiên có seed ghi sẵn, lưu danh sách ID trước khi chạy |
| Số lượng | 20 (MVP), 60 (mở rộng); 1 lượt/instance/hệ — SWE-bench lấy ý nghĩa từ nhiều instance, không từ lặp |
| Giấy phép | Mã SWE-bench: giấy phép riêng của dự án (nhớ là MIT, **chưa kiểm**). Mỗi instance là mã của một kho mã mở khác nhau, giấy phép khác nhau → ghi bảng giấy phép từng kho; chỉ công bố danh sách ID và kết quả, không phát lại mã |
| Khả thi trên Windows | Bộ chấm chính thức dùng Docker và ảnh Linux; Windows không phải môi trường hỗ trợ chính thức (nhớ như vậy, **chưa kiểm**). Đề xuất chạy trên Linux/WSL2 hoặc máy cloud như C1–C6 ("cloud" trong `runs.csv` ghi chú). Tối thiểu cần Docker, đĩa ~ vài chục GB, và `python` — gói thư viện chưa có trong repo |
| Khoảng trống kỹ thuật | `run.mjs` chấm cứng `node --test` (dòng 207, 209) nên cần adapter chấm pytest (H4). SWE-bench là Python, 1 kho 1 instance, không tương thích `tasks/` hiện tại |
| Rủi ro | Dữ liệu có thể nằm trong dữ liệu huấn luyện của mô hình (nhiễm bẩn); instance thường sửa nhỏ → có thể bất lợi cho multi-agent. Phải báo cả hai tầng (1 tệp / ≥ 2 tệp) |

## 6. Ước lượng theo gói (E-4), giới hạn đồng thời, rủi ro hạn mức

Công thức: lượt = Σ lượt các dòng; thời gian ≈ Σ lượt × (wall + 60 s) / đồng thời; USD = Σ lượt × USD mỗi lượt (E-3, đổi model theo tỉ lệ); token = lượt × token trung bình hệ (bài lớn/SWE nhân thêm hệ số quy mô). Thời gian là cận dưới (không cộng retry, hạn mức chờ).

| Gói | Tầng | Lượt | Thời gian thực (giờ) | Token vào+ra (triệu) | Token cache (triệu) | USD (giả định) |
|---|---|---:|---:|---:|---:|---:|
| A — cùng Sonnet, t1–t5, 6 lượt | MVP | 60 | 2,1 | 1,70 | 44,6 | 41 |
| F1 — A/B P1–P3 thăm dò | MVP | 60 | 2,1 | 2,19 | 56,9 | 54 |
| D — SWE-bench 20 instance | MVP | 40 | 2,4 | 1,46 | 38,1 | 41 |
| C — 2 bài lớn | MVP | 24 | 8,2 | 11,07 | 289,6 | 311 |
| **Tổng MVP** | | **184** | **14,8** | | | **≈ 448** |
| A+ — thêm 6 lượt (tổng 12) | Mở rộng | 60 | 2,1 | 1,70 | 44,6 | 41 |
| A2 — cùng Opus | Mở rộng | 60 | 2,1 | 1,70 | 44,6 | 68 |
| C3 — bài lớn thứ 3 | Mở rộng | 12 | 4,1 | 5,54 | 144,8 | 156 |
| D2 — +40 instance | Mở rộng | 80 | 4,9 | 2,91 | 76,2 | 82 |
| E — 2 runtime khác | Mở rộng | 18 | 0,7 | 0,66 | 17,1 | 16 |
| F2 — A/B xác nhận | Mở rộng | 120 | 4,1 | 4,38 | 113,7 | 109 |
| F3 — giữ lại t6–t8 | Mở rộng | 54 | 1,8 | 1,97 | 51,2 | 49 |
| **Tổng mở rộng (thêm)** | | **404** | **19,8** | | | **≈ 521** |

Nhận xét: gói C (bài lớn) chiếm ~70 % USD và ~55 % thời gian của MVP, và là phần ước lượng kém chắc nhất (hệ số 1,5 và 40 phút là giả định). Nếu hạn mức không đủ, giảm C xuống **1 bài** (12 lượt ≈ 156 USD, ≈ 4,1 giờ) và ghi rõ trong bài.

Giới hạn đồng thời:
- `--concurrency 2` (một cặp Claude Code/CCoding cùng lúc). Lý do: mọi lần chạy trước dùng 2; C5 cho thấy thời gian của chính Claude Code thay đổi theo thời điểm (`t3` 155–160 s ở C5 so với 246–258 s ở C6) nên tăng đồng thời sẽ thêm nhiễu chưa đo được. Làn nhanh bản thân đã chạy tối đa 4 hạng mục song song (C6), nên 2 hệ × 4 = tới 5 tiến trình model cùng lúc.
- Không dùng `--concurrency` lớn hơn 2 trước khi có số đo nhiễu: **đề xuất**, chưa kiểm.

Rủi ro hạn mức:
- Claude Max/Codex có hạn mức cửa sổ (5 giờ theo RUNTIMES.md) và 429. Gói MVP ~15 giờ thực sẽ chạm hạn mức; chia khối ≤ 2 giờ, đặt nghỉ giữa khối, và chốt trước với Tom việc dùng gói đăng ký hay khóa API (quyết định của chủ dự án, không tự đổi).
- Cơ chế failover của CCoding (`runtime.failover`, chuỗi model dự phòng) sẽ **đổi mô hình giữa lượt** khi 429 → phá thiết kế "cùng mô hình". Khi benchtest: tắt chuỗi dự phòng, hoặc đánh dấu và loại lượt có `runtime.fallback`/`runtime.failover` trong log (H5).
- `maxCostUsd` trong config là trần **toàn đợt** (ví dụ 200); đặt `--run` riêng cho mỗi gói và trần riêng; gói C đơn lẻ ước ~311 USD vượt 200 của ví dụ.
- Lượt treo stdin (579 s) đã từng xảy ra: thêm hạn treo (H6), nếu không mỗi lần treo tốn tới 45–60 phút timeout.

## 7. Đề xuất thay đổi harness (chỉ đề xuất, không hiện thực)

| Mã | Đề xuất | Lý do |
|---|---|---|
| H1 | `--shuffle --seed N`: xáo thứ tự job, xen kẽ hệ trong từng cặp, ghi seed và thứ tự vào MANIFEST | hiện job xếp cố định rep → bài → hệ (`run.mjs` quanh dòng 305–308) nên hệ đứng sau luôn bắt đầu sau; yêu cầu (b) |
| H2 | Ghi mô hình thực tế mỗi lượt vào `runs.csv` (cột `model`, `requested_model`) | tách hiệu ứng mô hình khi failover; `calls.csv` đã có nhưng `runs.csv` chưa |
| H3 | Ghi cấu hình: băm config, commit CCoding và harness, phiên bản `claude`, biến thể | tái lập, D6 |
| H4 | Bộ chấm cắm được (`grader: node-test` / `pytest`) | SWE-bench, bài Python |
| H5 | Gắn cờ lượt có `runtime.fallback`/`runtime.failover`; tùy chọn loại khỏi so sánh | mục 6 |
| H6 | Hạn treo theo hoạt động (không có đầu ra N phút → hủy, đánh dấu `hung`) | treo stdin C5 |
| H7 | `--max-cost` riêng từng lần chạy | trần theo gói |
| H8 | Ghi tải máy và số tiến trình đồng thời lúc bắt đầu | nhiễu thời điểm (t3 C5/C6) |

Cho đến khi H1 xong, có thể xáo thủ công bằng nhiều lệnh `run` nhỏ (mỗi lệnh một `--repeats 1 --from-rep r` và `--systems` đổi thứ tự) sắp theo seed ghi vào nhật ký. Cách này chỉ là tạm vì `run.mjs` vẫn chạy hai hệ của cùng ô liền nhau.

## 8. Lệnh chạy (KHÔNG chạy trong hạng mục này)

Chuẩn bị: bản sao `config.example.json` thành `config.samemodel.json` (ngoài repo hoặc không commit), đặt `baselineModel` = `"sonnet"`, `benchRoot`, `workRoot`, `maxCostUsd` theo gói; chạy CCoding bản đã chốt ở cổng của biến thể `ccoding-fastlane` (7422 trong ví dụ) từ commit ≥ `d7600f6` (commit này lấy từ chỉ dẫn giám đốc, chưa kiểm trong worktree).

```bash
# Gói A (MVP): cùng Sonnet, t1–t5, 6 lượt
node bench/vs-claude/harness/run.mjs run --config config.samemodel.json --run D-A1 \
  --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --systems claude,ccoding-fastlane --repeats 6 --concurrency 2

# Gói A+ (mở rộng): thêm lượt 7–12
node bench/vs-claude/harness/run.mjs run --config config.samemodel.json --run D-A2 \
  --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --systems claude,ccoding-fastlane --repeats 6 --from-rep 7 --concurrency 2

# Gói C (khi đã có L1, L2 trong tasks/): 
node bench/vs-claude/harness/run.mjs run --config config.samemodel.json --run D-C1 \
  --tasks l1-warehouse,l2-dsl --systems claude,ccoding-fastlane --repeats 6 --concurrency 2

# Gói F1: A/B bản vá — cần biến thể ccoding-a, ccoding-p1, ccoding-p2, ccoding-p3 trong config.variants (mỗi biến thể một cổng)
node bench/vs-claude/harness/run.mjs run --config config.samemodel.json --run D-F1 \
  --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --systems ccoding-a,ccoding-p1,ccoding-p2,ccoding-p3 --repeats 3 --concurrency 2

# Chấm lại và báo cáo
node bench/vs-claude/harness/run.mjs grade  --config config.samemodel.json --run D-A1
node bench/vs-claude/harness/run.mjs report --config config.samemodel.json --run D-A1
```

Ghi chú: tên bài `l1-warehouse`, `l2-dsl` và các biến thể `ccoding-a/p1/p2/p3` là tên **dự kiến**, chưa tồn tại. Gói D cần H4 trước khi có lệnh. Gói E cần chọn runtime qua cấu hình dự án/nhiệm vụ (UI "Tùy chọn nâng cao" hoặc `--runtime` của nhiệm vụ) chứ không qua `run.mjs`; chưa xác nhận `variants` truyền được tùy chọn `runtime` (cần kiểm `runCcoding`, dòng 128–148).

## 9. Thứ tự ưu tiên và tiêu chí dừng

Thứ tự (khớp lịch 17/11–31/12 chạy, 1–15/1 phân tích trong `publication-plan.md`):
1. Chuẩn bị (không tốn model): H1–H3, H5–H7, viết L1/L2, chọn ID SWE-bench, khai báo trước (Δ, ngưỡng, danh sách) trong một tệp có ngày.
2. **A** (D1+D2) — nếu A cho thấy khác biệt thời gian mất khi cùng mô hình thì kết luận bài chính đổi, nên chạy đầu tiên.
3. **F1** (RQ5, giữ nhánh bản vá nào qua sàng lọc).
4. **D** (SWE-bench 20) rồi **C** (bài lớn); C đặt sau D vì đắt nhất — nhưng nếu không có C thì D4 vẫn thiếu "bài > 15 phút", nên ít nhất giữ 1 bài lớn.
5. Mở rộng theo giá trị/USD: A+ → F2 → F3 (chỉ khi F2 có bản vá thắng) → D2 → C3 → E → A2.

Gói MVP chạy xong đến cuối tháng 12 là khả thi theo thời gian ước (~15 giờ thực, chia ~8 khối); ràng buộc thật là hạn mức và tiền, không phải giờ.

Tiêu chí dừng:
- Chạm `maxCostUsd` của gói → dừng gói, không nâng trần ngay trong lượt.
- Sau 6 lượt đầu mỗi ô, tính lại sd và n (chạy lại `estimate.mjs` với CSV mới); đủ lực theo công thức thì dừng, không chạy A+ cho ô đó.
- ≥ 2 lượt hỏng hạ tầng liên tiếp (treo, 429, lỗi dựng) → dừng, chẩn đoán trước khi tốn thêm.
- Bài mà cả hai hệ qua test ẩn < 90 % → xem bài lỗi, không dùng làm bằng chứng hiệu năng.
- F1: nhánh bản vá có cận dưới 95 % của hiệu tỉ lệ test đạt < −2 điểm % hoặc có bài giảm ≥ 10 test ở cả hai lượt → loại nhánh đó (design.md §5.3). F3 chỉ chạy một lần; không lặp lại khi kết quả không vừa ý.
- Không bỏ lượt khó nhìn: mọi lượt loại phải có lý do ghi trước (treo, failover) và báo cả kết quả có/không có lượt đó.

## 10. Cái chưa kiểm chứng

- Bảng giá, hệ số bài lớn, hệ số SWE-bench, overhead 60 s: giả định (mục 2).
- Số instance SWE-bench Verified/Lite, giấy phép, hỗ trợ Windows: từ hiểu biết sẵn, chưa tra nguồn trong lượt này.
- Cách ép Opus mọi pha ở CCoding (A2), truyền `runtime` qua `variants` (E): chưa kiểm cấu hình.
- Không có `stats.mjs` của S1 trong worktree này nên chưa đối chiếu `requiredRuns`.
- Thời gian bài lớn: chưa có lượt thử nào.
