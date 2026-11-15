# Đặc tả chẩn đoán cache claude-cli, điều kiện đo họp (B1) và phương án CTO Opus + nghiệm thu brief

> Vòng 4 gói 3 · hạng mục S2 · @methodologist · 3/11/2026 · phân loại dữ liệu: **Nội bộ**.
> **Chỉ là đặc tả.** Không lượt `claude -p` nào được chạy trong gói này; không sửa `src/`, `bench/`. Mọi số "dự kiến" là **giả thuyết cần kiểm**, không phải kết quả đo. Không đọc `runs.jsonl` hiện tại hay `results/b7prime`.

## 0. Tóm tắt thiết kế

| Phần | Câu hỏi | Thiết kế | Chi phí |
|---|---|---|---|
| 1 | Vì sao cache chiếm phần lớn chi phí; cache của `claude-cli` có bị vỡ bởi bộ công cụ hay cwd không | 3 cặp gọi (a) giống hệt, (b) khác bộ công cụ, (c) khác cwd (đối chứng) | ≤ 8 lượt (6 + 1 khởi động + 1 dự phòng) |
| 2 | Họp (arm `B1`) tiết kiệm bao nhiêu | So `B0` với `B1` trên **bài lớn** (kế hoạch ≥ 3 hạng mục) | Cần `task.json` của `l1-modules`, `l2-chain` (giám đốc quyết) |
| 3 | CTO dùng Opus + nghiệm thu brief có bắt được lỗi hơn mà không đắt hơn không | Bộ bài cài lỗi B-12, hai arm ghép cặp theo bài | Đề xuất, dừng sớm theo §3.5 |

---

## 1. Chẩn đoán cache của `claude-cli`

### 1.1 Cờ CLI và nơi truy về (`src/runtimes/claude-cli.ts`, trừ khi ghi khác)

| Thành phần | Giá trị | Vị trí |
|---|---|---|
| Lệnh | `this.cfg.command ?? 'claude'` | `claude-cli.ts:181` (kiểm có mặt: `:138`) |
| `-p` | luôn có | `claude-cli.ts:145` |
| `--output-format` | `stream-json` (kèm `--verbose`) | `claude-cli.ts:145` |
| `--model` | `this.models[req.model] ?? req.model` | `claude-cli.ts:144-145` |
| `--no-session-persistence` | luôn có (mỗi lượt là phiên mới, không `--resume`) | `claude-cli.ts:145` |
| Bộ công cụ | có công cụ: `--tools a,b,c` + `--permission-mode` (mặc định `acceptEdits`); không: `--tools ''` | `claude-cli.ts:147-148`, `:171` |
| `--allowedTools` | `req.tools.join(',')`, chỉ khi `allowTools` và `tools` khác rỗng | `claude-cli.ts:169` |
| `--settings` (hook PreToolUse) | JSON hook `claude-guard.js`, chỉ khi có công cụ | `claude-cli.ts:152-154` |
| `--strict-mcp-config --setting-sources project,local` | khi `cfg.userSettings` không bật | `claude-cli.ts:175` (ghi chú 93k → 7,6k token: `:173`) |
| Cờ thêm | `cfg.extraArgs` | `claude-cli.ts:176` |
| **Lời nhắc hệ thống** | **Không dùng** `--append-system-prompt`/`--system-prompt`. Vai trò + bối cảnh + việc được ghép thành **một chuỗi** qua **stdin** (`stdin: prompt`) | `claude-cli.ts:178`, `:188`; ghép: `src/runtimes/common.ts:7-13` |
| `cwd` tiến trình con | `req.cwd` | `claude-cli.ts:183` |
| Môi trường | `scrubEnv(process.env)` + `CCODING_GUARD` (+ `BASH_MAX_OUTPUT_LENGTH` nếu có) | `claude-cli.ts:155-167`, `:186` |
| Đọc usage | `parser.finalUsage()` | `claude-cli.ts:195` |

**Hệ quả cho phép đo:** phần "lời nhắc hệ thống" của CCoding nằm trong **tin nhắn người dùng** (stdin), *sau* lời nhắc hệ thống và định nghĩa công cụ mà chính Claude Code dựng. Thứ tự tiền tố cache của API là công cụ → hệ thống → tin nhắn. Nên (giả thuyết G1) đổi **công cụ** làm vỡ gần như toàn bộ tiền tố; đổi **nội dung stdin** chỉ vỡ phần đuôi. Lưu ý `--tools` và `--allowedTools` dùng cùng danh sách (`:148`, `:169`) nên "khác bộ công cụ" đổi cả hai.

### 1.2 Tham số cố định của phép đo

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| `MIN_CACHE_TOKENS[model]` | **Sonnet 5.5: [CHƯA KIỂM CHỨNG]; Opus 5.5: [CHƯA KIỂM CHỨNG]** (theo tài liệu giá đã biết với các thế hệ trước, ngưỡng thay đổi theo model, cỡ 1 024–4 096 token) | Tham chiếu **S4** (kiểm nguồn). Nếu S4 khác, S3 ghi chênh lệch vào crosscheck. Quy tắc đặt prompt giả: tổng tiền tố ≥ `max(MIN_CACHE_TOKENS) + 20 %`; ngữ cảnh nền của Claude Code (~7,6k, `claude-cli.ts:173`) thường đã vượt, nhưng **đo lượt khởi động để biết** chứ không giả định |
| `TTL_MS` | 300 000 (5 phút, bộ nhớ đệm mặc định) | Khoảng giữa hai lượt của cặp **≤ 60 s** (≪ TTL). Giữa hai cặp chờ **> 5 phút** để cặp sau không đọc nhờ cặp trước; nếu không chờ được thì chỉ phân tích lượt 2 và dùng `nonce` (xem dưới) |
| Model | một model duy nhất cho cả 3 cặp (khuyến nghị **Sonnet 5.5**, model thật của B7); chạy lại sang Opus chỉ khi cặp (a) dương tính | Đổi model đổi toàn bộ tiền tố |
| Lời nhắc giả | Đoạn tiếng Việt tổng hợp lặp ("Tài liệu mẫu số N: …"), **không dữ liệu thật**, độ dài đủ theo hàng `MIN_CACHE_TOKENS`; câu hỏi cuối cố định ngắn: "Trả lời đúng một từ: OK." Mỗi cặp có `nonce` (chuỗi ngẫu nhiên) **ở đầu stdin** để cặp này không đọc cache của cặp khác ở phần stdin | Nonce không ảnh hưởng tiền tố công cụ/hệ thống, nên phần đó vẫn có thể đọc chéo cặp; phân tích chỉ dùng **lượt 2 của từng cặp** |
| `cwd` | thư mục tạm **rỗng**, tên khác nhau, ngoài repo (không có `CLAUDE.md`, không `.git`) | Tránh `--setting-sources project,local` (`:175`) nạp tệp cấu hình khác nhau làm nhiễu cặp (c) |

### 1.3 Biến đo (từ `usage` của lượt 2 mỗi cặp)

`cache_creation_input_tokens` (CW), `cache_read_input_tokens` (CR), `input_tokens` (IN, phần không cache), `output_tokens`. Chỉ số: **tỉ lệ trúng** `h = CR / (CR + CW + IN)` (cùng định nghĩa với S1). Ghi thêm `h` của lượt 1.

### 1.4 Ba cặp và kết quả dự kiến

Mỗi cặp = lượt 1 (nạp) rồi lượt 2 (đo) trong ≤ 60 s, cùng model, cùng quy tắc ngoài biến đổi.

| Cặp | Khác nhau giữa lượt 1 và lượt 2 | Dự kiến lượt 2 (giả thuyết) | Quy tắc diễn giải |
|---|---|---|---|
| **(a) giống hệt** | không gì | h ≥ 0,9; CW ≈ 0 hoặc nhỏ (chỉ phần đuôi mới); IN nhỏ | h ≥ 0,9 ⇒ cache hoạt động qua `claude -p` với `--no-session-persistence` (`:145`). h < 0,5 mà tiền tố ≥ ngưỡng ⇒ cache **không** hoạt động ở mức cơ bản (nghi `--no-session-persistence`, ngưỡng, hoặc TTL); dừng, **không** chạy (b)(c) |
| **(b) chỉ khác bộ công cụ** (vd. `Read,Grep` so với `Read,Grep,Edit,Write`) | `--tools` và `--allowedTools` (`:148`, `:169`) | CR ≈ phần tiền tố không phụ thuộc công cụ — theo thứ tự công cụ → hệ thống, dự kiến **rất thấp** (h < 0,2); CW ≈ gần toàn bộ | h(b) ≪ h(a) ⇒ mỗi lần đổi bộ công cụ giữa các pha là một lần **trả lại giá ghi cache** cho toàn tiền tố, giải thích một phần tỉ trọng cacheWrite ở T-4. Nếu h(b) ≈ h(a) ⇒ G1 sai, công cụ không đứng trước phần lớn tiền tố; ghi cho Phòng Dev |
| **(c) chỉ khác cwd** (đối chứng) | `cwd` (`:183`) giữa hai thư mục rỗng tên khác | **Hai trường hợp**: **(c1)** cwd/thông tin môi trường **có** trong lời nhắc hệ thống của Claude Code ⇒ tiền tố đổi từ điểm đó, dự kiến h(c) thấp hơn h(a) rõ rệt (CW tăng bằng phần sau điểm đổi); **(c2)** **không có** ⇒ h(c) ≈ h(a) (chênh ≤ 0,05) | Quy tắc: nếu h(a) − h(c) ≤ 0,05 ⇒ c2, cwd không phá cache, đối chứng thành công (loại giải thích "đổi cwd" cho cặp (b)). Nếu > 0,05 ⇒ c1, ghi vị trí vỡ (CW lượt 2 / tổng) và khuyến nghị giữ cwd ổn định giữa các pha. **Đối chứng này tồn tại để tách tác động công cụ khỏi tác động môi trường**; nếu c1 thì (b) vẫn hợp lệ vì (b) giữ cwd |

Ngưỡng 0,9 / 0,5 / 0,2 / 0,05 là **lựa chọn thiết kế** để diễn giải nhanh, chưa suy ra từ dữ liệu; với n = 1 lượt/cặp đây là chẩn đoán cơ chế (có/không), **không** ước lượng tham số.

### 1.5 Ngân sách lượt gọi (tổng ≤ 8)

| Lượt | Mục đích | Có bắt buộc |
|---|---|---|
| 1 khởi động | Một lượt thật ngắn trước cặp (a) để đo kích thước ngữ cảnh nền và xác nhận `usage` có đủ 3 trường; kết quả **không** vào phân tích cặp | Tùy chọn (chạy) |
| 6 lượt | 3 cặp × 2 | Có |
| 1 dự phòng | Chạy lại **đúng một** lượt 2 nếu khoảng cách vượt 60 s, hoặc lỗi mạng; không dùng để "thử lại cho đẹp" | Chỉ khi có sự cố được ghi |
| **Tổng** | **≤ 8** | Vượt ⇒ dừng, báo giám đốc |

### 1.6 Tiêu chí xong và cách đo (phần 1)

- Mỗi cặp có 3 biến đo của lượt 2 + h, khoảng cách giữa hai lượt (giây), ghi trong một CSV nhỏ (cột `pair,call,model,gap_s,cw,cr,in,out,h`).
- Mỗi cặp được gán "khớp / không khớp dự kiến" theo bảng 1.4; kết luận ghi bằng lời, không p-giá trị.
- Lời nhắc giả được lưu cùng CSV và kiểm bằng mắt không chứa dữ liệu thật.
- Liên hệ phân tích: tỉ lệ trúng của S1 theo arm (gộp bài) đối chiếu h(a): nếu h của B7 thấp hơn nhiều h(a) thì chênh lệch là do *vỡ tiền tố giữa các pha/lượt* (b)(c), không phải do cache hỏng.

---

## 2. Điều kiện đo họp (arm `B1`)

### 2.1 Hiện trạng đã kiểm

| Điều | Bằng chứng |
|---|---|
| `B1` = `discussionRounds: 0`, nhãn "CCoding, no meeting" | `bench/vs-claude/arms.json:29-35`; khóa `discussionRounds` được `bench.ts` chuyển cho nhiệm vụ: `src/bench.ts:125` |
| Giá trị bị kẹp 0–3, mặc định 1 | `src/orchestrator.ts:314`; `src/config.ts:297` |
| Họp **tự bỏ** khi kế hoạch nhỏ: ít hơn `phases.meetingMinSubtasks` hạng mục (mặc định **3**) hoặc < 2 người tham gia | `src/orchestrator.ts:1597-1603` (đọc đến dòng 1603; điều kiện tiếp theo chưa đọc hết, **cần kiểm trước khi chạy**) |
| Làn đơn (B-01) không có họp (chuỗi pha `execute → accept`) | `improvement-backlog.md` B-01, B-11 |
| Bài có `task.json` trong `bench/vs-claude/tasks/`: 18 (a1, c1–c5, l1-oncall, l2-knights, l3, l4, r1, re1, s1, t1–t5); **`l1-modules` và `l2-chain` chỉ có `starter/`, chưa có `task.json`** | `Glob bench/vs-claude/tasks/*/task.json`; mô tả bài: `bench/vs-claude/harness/README.md:18-19` (192 và 149 test ẩn; "ước lượng 15–25 phút, chưa đo") |

### 2.2 Điều kiện tiên quyết (không làm trong gói này)

1. **Giám đốc quyết** có tạo `task.json` cho `l1-modules` và `l2-chain` hay không (gói này không được sửa `bench/`). Không có thì không có bài đủ lớn để thấy họp, và `B1` so với `B0` sẽ cho hiệu ứng ≈ 0 chỉ vì họp không xảy ra (kết quả rỗng, không phải kết quả âm).
2. **Kiểm tra họp có xảy ra** trong lượt thí điểm `B0`: `ccoding-task.json`/log phải cho thấy kế hoạch ≥ 3 hạng mục và có tin nhắn họp. Chỉ tính cặp `B0`/`B1` khi `B0` thật sự họp (loại hạng mục theo quy tắc khai báo trước, báo số lượt loại).
3. **Làn đầy đủ**: arm không ép làn đơn (B-01 chưa bật), nếu không họp luôn bị bỏ qua.
4. Chỉ số: token có trọng số (công thức giám đốc), thời gian thực, điểm test ẩn; USD là phụ, **ngoài họ Holm**.

### 2.3 Cỡ mẫu tối thiểu

Tham chiếu `variance-decomposition.md` **phương án A** (10 lượt × 5 bài): nửa độ rộng CI 90 % dự kiến **0,218** thang log khi R thật = 1,3 (dòng 8); sau 20 lượt (V-4) khó phân biệt R 1,3 với 1,6 (dòng 113). Áp cho họp:

| Điều | Đề xuất |
|---|---|
| Đơn vị | Cặp `B0`/`B1` cùng bài, cùng lô thời gian |
| Tối thiểu | **10 lượt mỗi arm mỗi bài** (như phương án A) × 2 bài (`l1-modules`, `l2-chain`) = **40 lượt** |
| Lưu ý | Phương án A tính cho **5 bài**; với **2 bài**, phương sai giữa bài ít được trung bình hóa nên nửa độ rộng sẽ **lớn hơn 0,218** — số chính xác **chưa tính, cần data-scientist chạy lại mô phỏng** với 2 bài. Không tuyên bố độ chính xác 0,218 cho thiết kế này |
| Hiệu ứng đáng quan tâm | Chưa có số đo của ta về họp; không đặt ngưỡng ý nghĩa trước dữ liệu. Báo ước lượng điểm + CI, nói "không phân biệt được" nếu CI chứa 1 |
| Thí điểm | 3 lượt `B0` mỗi bài trước (kiểm họp xảy ra, thời gian, hạn mức); tổng 6 lượt |

### 2.4 Tiêu chí xong và cách đo (phần 2)

Xong khi: (i) giám đốc có quyết định về `task.json`; (ii) thí điểm xác nhận họp xảy ra ở `B0`; (iii) 40 lượt có đủ chỉ số; (iv) báo R̂ = B1/B0 theo token có trọng số kèm CI bootstrap theo lượt (cùng cách `variance-decomposition.md`) và số lượt loại.

---

## 3. CTO Opus + nghiệm thu brief (B-11 a-brief)

### 3.1 Cơ sở trong backlog

- **a-brief**: CTO vẫn nghiệm thu nhưng chỉ trả bảng tiêu chí ngắn thay báo cáo nghiệm thu; trạng thái "cần giám đốc duyệt" (`improvement-backlog.md:26`, `:388`); arm đo `B7cb`/`B7cab` ghi ở §5 B-11.
- **a-skip** (bỏ nghiệm thu) bị chặn vì B-02 "không đủ dữ liệu" (`improvement-backlog.md:382`).
- Phần accept chiếm 47,7 % phần chênh B7 − A0 (T-4, `b7-cost-decomposition.md`; số lấy từ đề bài, **không đọc lại ở gói này**).
- **B-12**: bộ bài cài lỗi, nhãn thật biết trước, ghi quyết định cổng từng lần; đề xuất chưa chạy (`improvement-backlog.md:490-504`). Cỡ mẫu từ `agreement.md` C-3: 45 / 32 / 21 dương thật cho recall kỳ vọng 0,6 / 0,8 / 0,9 (nửa độ rộng ≤ 0,15).

### 3.2 Giả thuyết

- **H-O1 (chất lượng):** với cùng bài cài lỗi, CTO chạy Opus bắt được nhiều lỗi cài hơn CTO chạy Sonnet (tỉ lệ **nghiệm thu sai** = lượt có lỗi cài còn nguyên mà CTO vẫn "đạt" thấp hơn). Hướng: giảm.
- **H-O2 (chi phí):** nhờ bảng tiêu chí ngắn (a-brief), tăng chi phí do Opus của pha accept được bù một phần; chi phí tổng của "CTO Opus + a-brief" không vượt ngưỡng ở §3.5.
- Hai giả thuyết **tách riêng**: H-O1 là chính, H-O2 phụ. Không ghép thành "ổn cả hai" trước dữ liệu.

### 3.3 Thiết kế

| Mục | Nội dung |
|---|---|
| Khác biệt duy nhất | Model của pha accept (CTO): Sonnet 5.5 so với Opus 5.5; cả hai dùng a-brief. Khóa arm: `phaseModels` (`src/bench.ts:125`); **tên pha/cú pháp chưa kiểm** — Phòng Dev xác nhận trước khi viết arm mới vào `arms.json` |
| Arm | `Bx-S` = B7cab (CTO Sonnet + brief); `Bx-O` = B7cab + CTO Opus. (Đối chứng đầy đủ: B7 nguyên bản, nếu hạn mức cho phép) |
| Bài | Bộ B-12, bài **mới** (không t1–t5), cùng bài cho hai arm (ghép cặp) |
| Biến phụ thuộc chính | Nghiệm thu sai: nhị phân/ lượt có lỗi cài (nhãn thật theo cách cài, **tại thời điểm cổng quyết định**, B-12 trường 7b). Phân tích: McNemar chính xác trên cặp bất đồng + CI Clopper–Pearson từng arm; tỉ lệ nhãn sạch bị chặn nhầm đo cùng (n ≥ 72 lượt sạch để cận trên CP ≤ 5 % khi 0 chặn nhầm — B-12 trường 4b) |
| Chỉ số phụ | (i) token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out` — **thước đo chính về chi phí**; (ii) USD theo bảng giá model thật (khối `PRICES` của S1, kèm nhãn [CHƯA KIỂM CHỨNG] nếu giá chưa kiểm); (iii) thời gian thực; (iv) điểm test ẩn. Token có trọng số **không so trực tiếp giữa model khác giá** (Opus đắt hơn mỗi token): kết luận về chi phí dựa **USD**, ghi rõ nó là phụ và ngoài họ Holm |
| Cỡ mẫu | Mục tiêu nhỏ nhất tham chiếu B-12: **~25–46 lượt lỗi cài mỗi arm** cho CI một arm (nửa độ rộng ≤ 0,15 ở recall 0,8; giả định q, ρ chưa đo — B-12 trường 5). Cho **so sánh ghép cặp** cần số cặp bất đồng; công thức McNemar cần kiểm trước khi dùng, **không tuyên bố** cỡ mẫu cho phép so sánh này khi chưa có ρ, q, tỉ lệ bất đồng từ thí điểm |

### 3.4 Thí điểm

12 cặp bài cài lỗi (24 lượt) trước: ước lượng ρ, q, tỉ lệ bất đồng, USD/lượt mỗi arm. Từ số đó mới chốt N cuối bằng data-scientist.

### 3.5 Điểm dừng (khai báo trước; ngưỡng là lựa chọn thiết kế, không suy từ dữ liệu)

| Điểm dừng | Điều kiện | Hành động |
|---|---|---|
| Vô ích (chi phí) | Sau thí điểm 12 cặp: USD/lượt `Bx-O` > 2 × `Bx-S` **và** ước lượng điểm hiệu số nghiệm thu sai < 0,10 (giảm tuyệt đối) | Dừng, ghi "Opus không đáng giá ở thiết kế này" |
| Có hại | Chặn nhầm (lượt sạch bị CTO từ chối) ở `Bx-O` > `Bx-S` + 0,10 sau ≥ 20 lượt sạch | Dừng, ghi tác dụng phụ |
| Không đủ dương | < 10 lượt dương thật sau toàn bộ lượt | "Recall chưa ước lượng được" (quy tắc `agreement.md`/B-12 trường 6), không suy diễn |
| Hạn mức | Chạm hạn mức 5 giờ hoặc tổng chi phí vượt mức giám đốc đặt | Dừng, báo cáo phần đã có |
| Tối đa | Không quá N cuối đã chốt; không thêm lượt "cho đủ ý nghĩa" | — |

### 3.6 Tiêu chí xong và cách đo (phần 3)

Xong khi: (i) giám đốc duyệt B-11 a-brief và B-12; (ii) Phòng Dev xác nhận khóa `phaseModels` và trường ghi quyết định cổng; (iii) báo cáo gồm tỉ lệ nghiệm thu sai mỗi arm + CI CP, kết quả McNemar, USD/lượt và token có trọng số mỗi arm; (iv) §9 `preregistration.md` có dòng đăng ký trước lượt đầu tiên (B-12 trường 7g).

### 3.7 Giới hạn

Lỗi cài sẵn ≠ lỗi tự nhiên (chỉ khái quát cho lớp lỗi cài); một họ model; không đo được ảnh hưởng của Opus lên các pha khác; hiệu ứng Opus lẫn với hiệu ứng "ngữ cảnh brief" nếu hai arm khác nhau ở nhiều hơn một yếu tố (vì vậy chỉ đổi model).

---

## Việc cần người có quyền thực hiện

- Giám đốc: quyết tạo `task.json` cho `l1-modules`, `l2-chain`; duyệt B-11 a-brief, B-12.
- Phòng Dev: xác nhận cú pháp `phaseModels`; điều kiện họp tiếp theo `orchestrator.ts:1603`; trường ghi quyết định cổng.
- S4/S3: đối chiếu `MIN_CACHE_TOKENS` và giá.
- Kiểm chứng (CCoding tự chạy): `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md`; `node --test bench/vs-claude/harness/stats.test.mjs`; `node docs/research/scripts/consistency-check.mjs`.
