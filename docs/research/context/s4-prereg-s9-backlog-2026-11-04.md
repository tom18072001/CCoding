# S4 (vòng 4 gói 10): văn bản chèn vào `preregistration.md` §9 và `improvement-backlog.md` (4/11/2026)

Phân loại dữ liệu: **Nội bộ** (chỉ dùng dữ liệu benchmark đã có, bài tổng hợp, không có DLCN). Người viết: @research-lead (S4, nhiệm vụ T-20261104-110942-567). Không chạy benchmark, không gọi `claude -p`, không sửa `src/` hay mã `bench/`.

**Vì sao văn bản nằm ở tệp riêng.** Môi trường của S4 chỉ có công cụ ghi đè cả tệp. Hook `claude-guard` chặn mọi lệnh ghi qua shell, kể cả `git apply`. `preregistration.md` dài 649 dòng (hơn 34k token); muốn sửa thì phải chép tay lại toàn bộ tệp, và chỉ một lỗi chép cũng thành một thay đổi lặng lẽ trong tài liệu đăng ký trước, đúng điều §9 cấm. Vì vậy tệp này chứa **nguyên văn** các mục cần chèn, kèm điểm neo chính xác. Ai có công cụ sửa tại chỗ (người điều phối hoặc S6) chép nguyên khối, không sửa chữ. **Mốc đăng ký** của bước 2 B-14 là commit gộp tệp này vào nhánh nhiệm vụ, tức trước lượt đầu tiên của bước 2 (mục B.0).

---

## Phần 1 — Chèn vào `preregistration.md`

### 1.1 Điểm neo

- **Khối A, B, C** (theo thứ tự): chèn **sau** đoạn bắt đầu bằng `Ghi chú: pha chạy Opus thì chi phí cao hơn;` (cuối "Khối (c) — Lịch cloud/local" và hai đoạn sự cố đi kèm), **trước** dòng `## 10. Đạo đức & dữ liệu`. Khối A phải đứng trước B và C theo kế hoạch chung ("S4 đặt mục mới SAU mục khóa lại").
- **Dòng lịch sử bản v2.5:** chèn **trước** dòng bắt đầu bằng `- **v2.4 (3/11/2026, S1 của T-20261103-214630-c4e`.
- **Dòng đầu tệp:** chèn **trước** dòng `> **Bản 2.3 (3/11/2026, @methodologist, S2 của T-20261103-163327-d48):**` một dòng tóm tắt v2.5 và một dòng `>` trống.

### 1.2 Dòng đầu tệp

```markdown
> **Bản 2.5 (4/11/2026, @research-lead, S4 của T-20261104-110942-567):** chỉ thêm ở §9 ba mục: quyết định cổng khóa lại bộ giữ lại B-19, đăng ký trước bước 2 của B-14 (A/B `runtimes.claude-cli.stablePrefix`), và sai lệch V4-K2-1…7 (thẩm định thống kê D11). Không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào của H1–H10, B-01, B-02.
>
```

### 1.3 Khối A — mục khóa lại B-19 (đặt đầu tiên)

```markdown
### Khóa lại bộ bài giữ lại B-19 (vòng 4 gói 10; quyết định cổng ghi 4/11/2026)

**Lý do khóa lại.** D11 (`902fc78`) sửa `task.json` (SR-05 `sizeBasis`, SR-15) và `hidden/` (SR-16, SR-17, SR-24) của cả 10 bài giữ lại. Vì vậy `holdout-sample-size.mjs --size` báo lệch hash ở cả 10 bài, còn CT-09, CT-12, CT-13, CT-19 của `test/selfimprove.test.ts` đỏ đúng như thiết kế. Lock cũ ghi ở `8b0b6c3`.

**Chưa có lượt A/B nào của B-19.** Kiểm ở HEAD `6c454f6`: `git log --all` trên các đường dẫn selfimprove, b19 và `data/` cho kết quả rỗng; grep "selfimprove|B-19" trong `bench/vs-claude/results` cũng rỗng; chín tệp `runs.jsonl` không có nhánh bản vá nào. Chi tiết ở `self-improvement/holdout-relock-2026-11-04.md` §1. Giới hạn: không kiểm được `data/` trên máy khác.

**Rà diff `8b0b6c3..902fc78` (data-scientist, S1).** Không bài nào đổi `repo/`. `hidden/` chỉ được chép vào thư mục chấm sau khi agent chạy xong (`bench/vs-claude/harness/run.mjs:212`). Không bài nào lộ đáp án. Chín bài chỉ đổi bộ chấm hoặc siêu dữ liệu. Riêng `l3-reconcile` đổi cả `brief` (commit `096e47d`, SR-16): thêm một câu định nghĩa "duplicate row" (dòng dữ liệu trùng đủ sáu cột với một dòng trước đó; số đếm bằng số dòng dữ liệu trừ số dòng khác nhau, tính trên mọi trạng thái và mọi tháng). Theo quy tắc cổng, đây không phải bộ chấm hay siêu dữ liệu, nên S1 dừng trước `--hash` (`holdout-relock-2026-11-04.md` §2–§3).

**Quyết định của research-lead (4/11/2026, trước mọi lượt A/B): phương án (A), chấp nhận và khóa lại cả 10 bài.** Lý do:
1. Câu thêm vào chỉ nói rõ quy ước đếm `duplicate_rows_ignored` mà bộ chấm `exact` vốn đã dùng. Nó gỡ một chỗ mơ hồ của đặc tả, tức một lỗi bộ đo (SR-16), và không chứa giá trị đáp án nào.
2. B-19 so bản vá prompt với prompt gốc trên cùng bộ giữ lại, và mọi nhánh dùng chung một `brief` với cùng một bộ chấm, nên thay đổi đối xứng giữa các nhánh.
3. Chưa có lượt A/B nào, nên không nhánh nào từng chạy trên `brief` cũ. Quyết định này vì vậy không thể phụ thuộc kết quả A/B.
4. Phương án (B) đòi hoàn lại `brief` (sửa `bench/`, ngoài phạm vi gói) hoặc thay bài. Hoàn lại thì bài mơ hồ trở lại.

**Hệ quả, ghi trước:**
- (i) Ước phương sai của `l3` trong `holdout-and-sample-size.md` lấy từ `study-cloud`, mà dữ liệu đó đo trên `brief` cũ, nên ước SD điểm của `l3` có thể lệch.
- (ii) `brief` rõ hơn có thể làm `l3` dễ hơn và tiến gần trần. Nếu ở bước sàng lọc mọi lượt của mọi nhánh trên `l3` có `score` ≥ 0,99 thì `l3` được báo kèm nhãn trần. **Bộ giữ lại không đổi sau khi đã xem dữ liệu A/B.**
- (iii) Cỡ mẫu (sàng lọc 60 lượt, xác nhận 160 lượt) dự kiến không đổi, vì `holdout-sample-size.mjs` không đọc `size`. Phải xác nhận bằng `--size` sau khi băm.

**Bước còn lại (data-scientist, trước lượt A/B đầu tiên):** chạy `--hash`, cập nhật `self-improvement/holdout-lock.json` và các bảng của `holdout-and-sample-size.md`, rồi chạy `--size` và `--check`. Đối chiếu hash với blob `git show 902fc78:<path>`; script chuẩn hóa CRLF thành LF trước khi băm (`prereg-tests.mjs:189`). Kiểm CT-09/12/13/19 xanh. Sau đó điền bảng dưới. **Không được chạy lượt A/B nào của B-19 khi bảng còn trống.**

| Mục | Giá trị |
|---|---|
| Hash lock cũ (commit) | `8b0b6c3` (từng bài: theo `holdout-lock.json` ở commit đó) |
| Hash lock mới (commit khóa lại) | data-scientist điền sau `--hash` |
| `--check` | data-scientist điền (exit code, đầu ra) |
| `--size` trước / sau | data-scientist điền |
| CT-09, CT-12, CT-13, CT-19 | data-scientist điền |
```

### 1.4 Khối B — đăng ký trước bước 2 của B-14

```markdown
### Đăng ký trước bước 2 của B-14: A/B `runtimes.claude-cli.stablePrefix` (ghi 4/11/2026, trước lượt đầu tiên)

**Vị thế.** Mục này ghi **trước mọi lượt của bước 2**: chưa có thư mục `bench/vs-claude/results/b14-step2/` và chưa có dòng dữ liệu nào. Dữ liệu tác giả đã thấy khi viết:
- E1 (`results/b14-diag/RUNLOG.md`), chỉ cho biết cơ chế;
- σ và tỉ phần cacheWrite của arm B7 trên t1–t5 trong `study-cloud`, dùng để chọn bài và tính N (`context/k4-e2-descriptive-b14-step2-n.md` §2).

Không ai đã thấy dữ liệu nào có công tắc bật. **Mốc khóa** là commit gộp của nhiệm vụ T-20261104-110942-567. Người chạy ghi hash đó vào dòng đầu của `results/b14-step2/RUNLOG.md` trước lượt đầu; **dòng đó còn trống thì không được chạy**. Sau mốc khóa, mọi thay đổi là sai lệch và phải ghi thành dòng riêng.

Bước 2 **chưa được giám đốc duyệt chạy**. Lý do phải duyệt: bước này đổi cấu hình công cụ và chuyển việc chặn theo pha sang hook (B-14 trường 9). Không phép nào ở đây vào họ Holm, và K của §2.5 không đổi.

- **(1) Câu hỏi và giả thuyết.**
  - **Câu hỏi:** trên làn đơn, bật `runtimes.claude-cli.stablePrefix` có làm đổi token có trọng số mỗi lượt không?
  - **G2 (giả thuyết có hướng):** bật công tắc làm **giảm** token có trọng số trung bình mỗi lượt, tức R = bật/tắt < 1.
  - **Căn cứ:** E1 cặp (b) cho thấy đổi bộ công cụ làm vỡ toàn bộ tiền tố (h = 0,00; CW lượt 2 = 41 464; CR = 0). Cặp (c) cho thấy đổi `cwd` không ảnh hưởng (h = 0,98, bằng h(a)).
  - **Phép kiểm vẫn hai phía,** vì hướng ngược lại có thể xảy ra: bộ công cụ cố định `STABLE_TOOLS` (`src/runtimes/claude-cli.ts:234`) gồm 10 công cụ, nên mọi lượt gọi, kể cả pha chỉ đọc, mang định nghĩa của cả 10. Tiền tố dài hơn có thể làm tăng `input`/`cacheWrite` ở lượt đầu.
  - **Công tắc gồm hai thay đổi đi cùng nhau:**
    - (i) bộ công cụ cố định cho cả nhiệm vụ (`claude-cli.ts:241-243`), còn quyền theo pha chuyển cho hook (`:268`, `src/tools/claude-guard.ts:91`);
    - (ii) pha không sửa tệp chạy ở thư mục gốc nhiệm vụ (`src/orchestrator.ts:3475-3476`).

    A/B đo **cả gói**. E1 (c) gợi ý phần (ii) đóng góp gần 0, nhưng hai phần không tách được, nên không quy hiệu ứng cho riêng phần nào.
- **(2) Arm.** Hai nhánh, chỉ khác đúng một khóa cấu hình:
  - **Tắt (đối chứng), ký hiệu B7:** arm B7 của `bench/vs-claude/arms.json`, "CCoding làn đơn (B-01)", `lane: single`, tức **làn đơn** (một agent). `runtimes.claude-cli.stablePrefix` vắng hoặc `false` (mặc định).
  - **Bật, ký hiệu B7sp:** cùng arm B7, cùng commit server, thêm `runtimes.claude-cli.stablePrefix: true` vào `ccoding.local.json` của server. Arm của bench không đặt được khóa runtime (`COMMON_KEYS`, `src/bench.ts:141`), nên **B7sp chỉ là nhãn phân tích**, không phải arm mới trong `arms.json`. Hai nhánh phân biệt bằng thư mục `--out`. Không thêm arm, không sửa `bench/`.
  - Mọi cấu hình khác giữ y nguyên ở cả hai nhánh, kể cả `extraArgs: ["--disallowedTools", "WebFetch,WebSearch"]` (V3-04). RUNLOG ghi sha256 của `ccoding.local.json` mỗi nhánh kèm `diff` giữa hai bản; diff chỉ được khác đúng khóa `stablePrefix`.
  - **Lý do chọn B7, không chọn B7cab:** σ có sẵn là của B7 (9 lượt mỗi bài, `study-cloud`), và tỉ phần cacheWrite C-1 (34,8 %) cũng đo trên B7. B7cab có thêm ba công tắc `slim` và chỉ có n nhỏ từ E2.
- **(3) Bài cố định:** `t2-orders`, `t3-api`, `t4-perf`.
  - **Lý do:**
    - `t4-perf` có nhiều lần gọi nhất (TB 4,3) và tỉ phần 1,25·cacheWrite cao nhất (0,403), nên cơ chế E1 (b) có nhiều cơ hội tác động nhất.
    - `t2-orders` có σ nhỏ nhất (0,076) và ít lần gọi nhất (2,0), là ca "ít pha".
    - `t3-api` ở mức giữa (σ 0,252; 2,3 lần gọi; token lớn).
    - Bỏ `t1` (σ 0,381) và `t5` (σ 0,338) vì chúng làm N tăng khoảng 2,2 lần.
  - **Giới hạn ghi trước:** bài được chọn theo σ và cacheWrite quan sát trên B7, tức trên dữ liệu đã có (không phải dữ liệu nhánh bật). Kết luận chỉ áp cho ba bài này và cấu hình đã đo; không khái quát sang t1–t5 hay bài lớn. E1 dùng lời nhắc giả (`taskId: 'cache-diag'`), nên không có "bài E1" để kế thừa.
- **(4) Số lượt: 16 lượt mỗi bài mỗi nhánh × 3 bài × 2 nhánh = 96 lượt.**
  - **Công cụ:** `requiredRuns`/`zInv` của `bench/vs-claude/harness/stats.mjs`, gọi qua `node docs/research/analysis/k4-b14-step2-n.mjs`, cùng công cụ với `holdout-sample-size.mjs`.
  - **Đầu vào:**
    - thước đo ln(token có trọng số);
    - σ gộp trong bài = 0,182 (B7, t2–t4, 9 lượt mỗi bài);
    - α = 0,05 hai phía, power = 0,8, τ² = 0;
    - hai nhánh giả định cùng σ.
  - **Hiệu ứng kế hoạch x = 10 %,** tức Δ = ln(1/0,9) = 0,105. Từ đó n = 47 mỗi nhánh và r = ⌈47/3⌉ = 16 mỗi bài.
  - **x = 10 % là giả định kế hoạch do research-lead chốt, không phải số đo.** E1 không ước lượng mức tiết kiệm. 10 % bằng khoảng 29 % của phần 1,25·cacheWrite (≈ 35 % token có trọng số ở B7), mà phần đó không thể cắt hết vì lượt đầu luôn phải ghi.
  - **Ghi trước:** nếu hiệu ứng thật nhỏ hơn 10 % thì power < 0,8 (x = 5 % cần 396 lượt). Kết quả "không phân biệt được" khi đó không phải bằng chứng là không có hiệu ứng.
  - **Lịch ABBA theo khối 4 lượt**, chạy tuần tự trên một server:

    | Khối | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
    |---|---|---|---|---|---|---|---|---|
    | Nhánh | tắt | bật | bật | tắt | tắt | bật | bật | tắt |
    | Lượt | r1–4 | r1–4 | r5–8 | r5–8 | r9–12 | r9–12 | r13–16 | r13–16 |

  - **Lệnh mỗi khối:**

    `node bench/vs-claude/run.mjs --arms B7 --tasks t2-orders,t3-api,t4-perf --repeats <4·k> --timeout 20 --out bench/vs-claude/results/b14-step2/<off|on>`

    với k là số thứ tự khối của nhánh đó. Runner bỏ qua khóa đã `done` trong cùng `--out` (`run-plan.md` §5.4.3), nên `--repeats 8` chỉ chạy r5–8.
  - **Đổi nhánh** gồm hai việc: sửa đúng khóa `stablePrefix`, rồi khởi động lại server. Thời điểm đổi (UTC) ghi vào RUNLOG.
  - **Lý do chọn ABBA:** hai nhánh chạy nối tiếp trên cùng máy, và ABBA cân bằng được trôi theo thời gian (tải cloud, hạn mức, TTL cache chưa biết). Toàn bộ 96 lượt chạy ở **một nơi** (cloud hoặc local, ghi RUNLOG), không tách giữa hai nơi.
- **(5) Thước đo.**
  - **Chính:** ln(`tokens.weighted`) mỗi lượt, với `tokens.weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`. Báo R̂ = exp(T).
  - **Phụ (mô tả, không p, ngoài họ Holm):**
    - (a) tỉ lệ trúng cache mỗi lượt h = cacheRead/(cacheRead + cacheWrite + input), tính từ `tokens` của dòng `runs.jsonl`, báo trung vị theo bài × nhánh;
    - (b) tỉ phần 1,25·cacheWrite / token có trọng số;
    - (c) test ẩn: tỉ lệ `pass` và `score` mỗi nhánh, kèm CP 95 %. Đây là điều kiện an toàn "không kém hơn" của B-14 trường 6, **chỉ mô tả**, vì chưa có cỡ mẫu cho phép kiểm không-kém-hơn;
    - (d) `wallSec`;
    - (e) số lần gọi (`calls`).
  - **Bỏ USD,** vì `costUsd` của arm CCoding bằng 0 (SR-02).
- **(6) Phép kiểm, α, phía.**
  - **Thống kê:** T = trung bình theo bài của (TB ln bật − TB ln tắt).
  - **p hai phía:** `permStratified` (`bench/vs-claude/lib/stats.mjs:162`) với `cells = [{ task, a: ln tắt, b: ln bật }]`, `alt: 'two'`, `margin: 0`, `M: 10000`, `seed: 20261104`. Vì ∏ C(32, 16) > 10⁶ nên hàm chạy Monte Carlo, và p = (k + 1)/(M + 1).
  - **α = 0,05 hai phía,** một phép kiểm chính duy nhất, không hiệu chỉnh bội.
  - **CI 95 % của R = exp(T):** bootstrap phân tầng (trong từng bài, lấy lại lượt trong từng nhánh), 4000 vòng, hạt 20261104, phân vị.
  - **Phán quyết:**
    - "giảm" khi p ≤ 0,05 **và** cận trên CI của R < 1;
    - "tăng" khi p ≤ 0,05 **và** cận dưới > 1;
    - còn lại là "không phân biệt được".
  - **Lỗi đã biết không ảnh hưởng phép kiểm này:** S-1 chỉ xảy ra với điểm chạm trần kèm `margin`, ở đây `margin` = 0 và thước đo là token liên tục. T-1 và T-2 thuộc `tost`, không dùng ở đây.
  - **Script phân tích** `docs/research/analysis/b14-step2.mjs`, có test, phải commit và ghi hash vào RUNLOG **trước lượt đầu**. Script chỉ được gọi các hàm trên với đúng tham số trên. Thiếu script có test và hash thì kết quả chỉ được báo mô tả.
- **(7) Điểm dừng.**
  - **Dừng bình thường:** đủ 96 lượt `done`.
  - **Không xem token, h hay điểm theo nhánh trước khi đủ 96 lượt.** Người chạy chỉ xem trạng thái và lỗi; mọi lần xem log phải lọc bỏ cột token và điểm. Đây là bài học từ sai lệch "lỡ thấy điểm 6 lượt" của E2. Lỡ thấy thì ghi RUNLOG, không loại lượt.
  - Không dừng sớm vì kết quả, không thêm lượt (§4.4(b)).
  - **Chạm hạn mức hoặc hết credit:** dừng, chờ cửa sổ sau, giữ nguyên thứ tự khối. Nếu phải dừng hẳn thì chỉ phân tích các **cặp khối AB hoàn chỉnh** (mỗi cặp đủ cả hai nhánh), báo n thực, gắn nhãn "chưa đủ N", và không chạy bù quá 96 lượt.
  - **Dừng an toàn, ngay lập tức:** dừng khi ở nhánh bật có bất kỳ dấu hiệu nào cho thấy hook để lọt quyền ghi ở pha chỉ đọc (log hook, `leak`, hoặc tệp đổi ngoài pha `execute`/`revise`). Báo Phòng Dev và giám đốc; dữ liệu tới thời điểm đó chỉ mô tả.
  - **Tiền điều kiện trước lượt đầu:** bộ test lệnh ác ý cho chế độ `stablePrefix` (B-14 trường 7(c)) xanh trên commit ghim, ghi kết quả vào RUNLOG.
- **(8) Quy tắc loại lượt.**
  - Áp §4.1 và §4.3 (Q, L, T, E1, E4), đối xứng giữa hai nhánh. `status ≠ done` thì loại.
  - Thay bằng `rep` mới, tối đa 2 lượt mỗi ô (bài × nhánh). Quá mức thì ô đó "thiếu dữ liệu".
  - **Kiểm cấu hình đầu mỗi khối:** ghi sha256 của `ccoding.local.json` vào RUNLOG. Khối chạy nhầm cấu hình của nhánh kia thì loại cả khối, chạy lại khối đó đúng một lần, và ghi sự cố.
  - **Không loại lượt theo token, h hay điểm.** Không loại ngoại lai.
- **(9) Hash.** Ghi commit ghim của server (phải chứa B-14b, tức `STABLE_TOOLS` và hook `stablePrefix`) và phiên bản `claude` CLI vào RUNLOG. Cả 8 khối dùng một commit và một CLI. CLI đổi giữa chừng thì dừng và ghi §9 (tiền lệ V4-04).
- **(10) Ràng buộc.**
  - **Bước 2 không thay E4** và không thay phần nào của đợt 3e: N, arm và bài của E4 giữ nguyên (R_E4 = 16, R_B6 = 32; khối (a) bước 5). Dữ liệu bước 2 không được dùng để đổi bất kỳ tham số nào của E1–E6. Bước 2 không lấy chỗ của E4 trong thứ tự ưu tiên khối (b), và chỉ chạy khi giám đốc duyệt riêng.
  - Kết quả không tự đổi mặc định: `stablePrefix` giữ **tắt** cho tới khi giám đốc duyệt sau khi có kết quả.
- **Nguồn:** `results/b14-diag/RUNLOG.md` (E1); `context/k4-e2-descriptive-b14-step2-n.md` §2 (σ, N, chọn bài); BL B-14 trường 4, 6, 7, 9; CD 1.4; `src/runtimes/claude-cli.ts:231-268`; `src/orchestrator.ts:3475-3476`; `bench/vs-claude/lib/stats.mjs:152-208`.
```

### 1.5 Khối C — sai lệch K2 (thẩm định thống kê D11)

Bảng chép nguyên từ `context/k2-stats-review-2026-11-04.md` §6 (S2, @methodologist). Số chạy được S3b xác nhận ở mục 10 của cùng tệp. Phần thêm của S4 gồm: câu dẫn, dòng duyệt H7 và đoạn nguồn số chính thức.

```markdown
### Sai lệch vòng 4 gói 10 (thẩm định thống kê D11; ghi 4/11/2026)

**Mọi dòng dưới ghi SAU khi đã thấy dữ liệu.** D11 chạy lại `analyze.mjs` mới trên `study-cloud` (D11 §2), rồi K2 đọc mã và chạy ca biên. Không dòng nào đổi giả thuyết, ngưỡng hay họ Holm (K = 0). Nguồn: `context/k2-stats-review-2026-11-04.md`, gồm §4–§7 (S2) và §10 (S3b). Mọi số của `analyze.mjs` trên `study-cloud` chạy với `--allow-mixed-judge` (SR-07), nên là **số đối chiếu**.

| # | Ngày | Mục | Đã đăng ký | Thực hiện | Lý do | Đã thấy dữ liệu? | Hệ quả |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V4-K2-1 | 4/11/2026 | H7, §3.1 (P:174, :187), P:407 | Trung vị tỉ số SD theo bài ≤ 0,7, r ≥ 5, ≥ 3 bài; phép đổi (SR-14) phải làm **trước khi chạy** và giữ phép cũ làm độ nhạy | `analyze.mjs` thay bằng tỉ số SD gộp theo phương sai gộp, bài có > 1 lượt, 0/0 := 1; chạy lại trên study-cloud sau khi dữ liệu đã có (D11 §2): 0,00 [0,00; 1,00], 13 bài | Sửa thiên lệch bỏ bài sd(A0) = 0 (P:187) | **Có** (study-cloud đã xem) | v2.1 **không có quy tắc suy biến cho sd gộp = 0** (P:107 chỉ cho H6). H7 báo **"không xác nhận"** (chưa đủ N theo đăng ký: 2 bài có r ≥ 5; hai cách đọc điểm ước lượng và cận trên không đồng ý). Trung vị cũ (1,00, 18 bài) giữ làm độ nhạy. Không SUPPORTED |
| V4-K2-2 | 4/11/2026 | H2 (P:169, :182) | Hai chiều: (i) `est ≤ 0,05`; (ii) cận trên CI 90 % ≤ +0,05; vẫn ước lượng | Nhãn của `analyze.mjs` chỉ theo (ii) (SR-04) | Thực hiện chiều (ii) đã đăng ký | Có | Không đổi quy tắc. H2 báo số: +2,8 pp, TOST90 [0,0; +8,3]; **"không kết luận"**, không "bác bỏ" |
| V4-K2-3 | 4/11/2026 | H6 (P:105, :108) | Tập khai báo 7 bài; min(n_A1, n_A2) < 3 ⇒ ước lượng | Chạy lại: n_A1 = n_A2 = 0 vì A1/A2 chưa chạy các bài khai báo | Tuân thủ (a), (d) | Có | Không sai lệch. Số "SUPPORTED" cũ đến từ bài ngoài tập khai báo, rút lại. Bảng 10: chưa đủ N |
| V4-K2-4 | 4/11/2026 | H3, H4, H9 (P:100, :158, :184, :189) | H3 trên 1 bài s1; H4, H9 trên 1 bài, mô tả | SR-11 thêm cổng ≥ 3 bài (`analyze.mjs:136, :192, :248`) | Quy tắc chung SR-11 | Có | Nhãn thành `insufficient data` thay cho "suy biến" (H3) hoặc "mô tả" (H4, H9). Bảng 10 theo nhãn đăng ký; không đổi kết luận |
| V4-K2-5 | 4/11/2026 | H8 (P:175, :407) | Thước đo `formatMiss` | SR-13 đổi sang `untouchedFileFailures`/`redAtEnd` | Cải tiến thước đo | Có | Dòng cũ thiếu trường ⇒ `insufficient data`; `formatMiss` giữ làm độ nhạy |
| V4-K2-6 | 4/11/2026 | H1, H10 (P:154-155, :181) | Danh sách bài cố định (H1: c3, c4, c5, r1); H1, H10 bỏ bài chạm trần pilot | `size` mới (SR-05) và lọc theo loại; không loại bài trần pilot | Định nghĩa lại `size` | Có | H1: 7 → 6 bài, +2,8 pp [0,0; +9,0]; chỉ **ước lượng/mô tả** (P:87-88), không nêu "xác nhận" |
| V4-K2-7 | 4/11/2026 | B-01 (P:80, PT:93-94) | Log-tỉ số theo bài; trần ≥ 0,99 và ≥ 3 bài cho (c) | `analyze.mjs` tính log của tỉ số hai trung bình qua bài; (c) không có trần | Lệch cài đặt | Có | **Số B-01 chính thức lấy từ `prereg-tests.mjs`**, không từ `analyze.mjs` |

**Duyệt H7 (research-lead, 4/11/2026).** Tôi chấp nhận phán quyết của methodologist. Tỉ số SD gộp 0,00 là **suy biến do trần**: sd gộp của B0 bằng 0, và 10/13 bài có sd(A0) = 0. Ngoài ra, cận trên 1,00 của CI đến từ quy ước 0/0 := 1, với 139/4000 mẫu bootstrap (3,48 %) rơi vào nhánh đó (S3b, V1). v2.1 không có quy tắc suy biến nào áp được cho H7, nên mọi quy tắc xử lý tình huống này là **sai lệch đặt ra sau khi thấy dữ liệu**. Vì vậy Bảng 10 ghi H7 là **"không xác nhận"** (chưa đủ N theo đăng ký) và chú thích hai cách đọc. Tuyệt đối không ghi SUPPORTED. Quy tắc cho H7 về sau (loại bài trần khỏi phương sai gộp; mẫu số bằng 0 thì không báo tỉ số; cận trên CI quyết định; r ≥ 5 và ≥ 3 bài) chỉ áp **từ lần đăng ký sau, không hồi tố** (K2 §4.2 điểm 5).

**Duyệt SR-04 / H2.** SR-04 không phải sai lệch về quy tắc. Nó chỉ thực hiện chiều (ii) đã đăng ký ở P:169 và P:182. Nhãn đúng là "không kết luận" (lo90 = 0,0, nên không phải "bác bỏ"), và H2 vẫn là ước lượng.

**Nguồn số chính thức (mỗi ô Bảng 10 một nguồn; K2 §7 và §10.3):**
- **Lấy từ `prereg-tests.mjs`** (chạy không cờ; đầu ra trùng từng dòng `study-cloud-final/prereg-tests-448.md`): H3 (§5, suy biến/mô tả), H5 (§3, cặp cùng cửa sổ), H7 (§5, chưa đủ N), B-01 B7 và Holm (K = 0).
- **Lấy từ `study-cloud-final/step4-extra-448.md`:** B-01 B6.
- **Lấy từ `study-cloud-final/final-extra.md`:** H4 (mô tả).
- **Lấy từ `analyze.mjs` (số đối chiếu):** H1 (ước lượng), H2 (ước lượng, "không kết luận"), H6 (chưa đủ N), H8, H9 (mô tả), H10 (thăm dò).
- **Không dùng** dòng SUPPORTED của B-01(c) trong `analyze.mjs`, vì nó thiếu quy tắc trần. `prereg-tests.mjs` cho "không kết luận" do cả 5 bài t1–t5 chạm trần.
- **Cờ `analyze.mjs` của bài báo v0.4 chỉ tìm được một phần:** `--baseline A0-sonnet --treatment X`, theo `study-cloud-final/README.md`. Hai cờ `--allow-mixed-judge` và `--b01-arm B7|B6` là cờ của lần chạy lại theo D11 hoặc là giả định, không phải cờ v0.4 (K2 §10.1).

**Lỗi mã `bench/` giao Phòng Phát triển** (chưa sửa ở gói này):
- **T-1:** `tost` cho `equivalent = true` trên phân phối suy biến. **Phải sửa trước lượt đầu của V4-3e-E6.**
- **B-1:** `bootP` với NaN cho p = 1/4001.
- **S-1:** H2′ cho p = 1/252 khi bài chạm trần mà có margin. **Không được khóa H2′ khi chưa sửa.**
- **T-2:** `tost` logratio dùng tỉ số hai trung bình.
- **A-3:** `analyze.mjs:246` đọc `citationPrecision`, trong khi grader ghi `citationValidity`.
- **P-2:** kích thước hoán vị.
```

### 1.6 Dòng lịch sử bản

```markdown
- **v2.5 (4/11/2026, S4 của T-20261104-110942-567, @research-lead):** chỉ **thêm** ở §9 ba mục: (1) quyết định cổng khóa lại bộ giữ lại B-19, theo phương án (A) chấp nhận đổi `brief` của `l3-reconcile`; hash mới do data-scientist điền trước lượt A/B đầu; (2) đăng ký trước bước 2 của B-14 (A/B `stablePrefix` trên B7, gồm t2/t3/t4, 16 lượt mỗi bài mỗi nhánh, 96 lượt, ABBA, hoán vị phân tầng hai phía α = 0,05); (3) sai lệch V4-K2-1…7 kèm nguồn số chính thức. Không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào của v2.4.
```

---

## Phần 2 — Cập nhật `improvement-backlog.md`

### 2.1 Dòng cập nhật đầu tệp

Chèn **sau** dòng bắt đầu bằng `> Cập nhật vòng 4 gói 6 (T-20261103-195822-b03` và **trước** dòng `> Nguyên tắc của giám đốc:`:

```markdown
> Cập nhật vòng 4 gói 10 (T-20261104-110942-567, S4, @research-lead, 4/11/2026): trạng thái B-12, B-14, B-16, B-19 theo kết quả E1, E2 và quyết định khóa lại bộ giữ lại. Mỗi trạng thái dẫn về tệp bằng chứng. Cột "Trạng thái" vẫn dùng một trong bốn giá trị của gói 6; phần mới nằm ở "Ghi chú trạng thái" và ở dòng "Trạng thái 4/11/2026" dưới tiêu đề từng mục của §5.
```

### 2.2 Ô "Trạng thái" và "Ghi chú trạng thái" ở bảng §0

Thay hai ô cuối của bốn dòng sau. Các cột khác giữ nguyên.

| Dòng | Trạng thái (mới) | Ghi chú trạng thái (mới) |
|---|---|---|
| **B-12** | cần đo | **4/11/2026: E2 xong, chỉ có mô tả, chờ E4.** E2 có 28/28 lượt. q̂ = 0 ở b02 và cto (0/4 mỗi arm, CP [0; 0,60]; bỏ 6 lượt "lỡ thấy điểm" thì còn 0/3, CP [0; 0,71]). Không có dương thật nên không suy diễn recall. N của E4 giữ R = 16 / R_B6 = 32 (`preregistration.md` §9 khối (a) bước 5). Bằng chứng: `bench/vs-claude/results/gates-pilot/RUNLOG.md` (mục "Phân tích mô tả (K4, 4/11/2026)"), `docs/research/context/k4-e2-descriptive-b14-step2-n.md` §1. Đặc tả cũ: `BRIEF-D9.md` mục 7 |
| **B-14** | cần giám đốc duyệt | **4/11/2026: bước 1 (E1) xong.** Nguồn ghi cache là **bộ công cụ đổi theo pha**: (b) h = 0,00, CW 41 464; (c) đổi `cwd` vẫn h = 0,98. **Bước 2 đã đăng ký** (`preregistration.md` §9 "Đăng ký trước bước 2 của B-14", v2.5): B7 tắt/bật `stablePrefix` × t2, t3, t4 × 16 = 96 lượt, ABBA, chưa chạy. Chờ giám đốc duyệt vì chạm hook. Bằng chứng: `bench/vs-claude/results/b14-diag/RUNLOG.md`, `docs/research/context/k4-e2-descriptive-b14-step2-n.md` §2. TTL thật chưa xác định |
| **B-16** | cần đo | **4/11/2026: thí điểm E2 xong (12 cặp B7cab/B7cabO), chỉ có mô tả, chờ E4.** Tỉ lệ nghiệm thu sai không ước lượng được (q̂_cto = 0, không dương thật). Token có trọng số TB/lượt: B7cab 77 657, B7cabO 102 742 (bỏ 6 lượt: 78 182 và 105 915). Không so trực tiếp vì pha `accept` dùng model khác giá. McNemar chỉ làm ở E4. Bằng chứng: `bench/vs-claude/results/gates-pilot/RUNLOG.md`, `docs/research/context/k4-e2-descriptive-b14-step2-n.md` §1.3 |
| **B-19** | D10 (đặc tả xong, mặc định tắt) | **4/11/2026: khóa lại bộ giữ lại đã được duyệt, chưa băm xong; chưa có lượt A/B.** D11 (`902fc78`) đổi `task.json`/`hidden/` của cả 10 bài. Rà diff: 9 bài chỉ đổi bộ chấm hoặc siêu dữ liệu; `l3-reconcile` thêm một câu định nghĩa trong `brief` (`096e47d`). Research-lead chọn phương án (A) (`preregistration.md` §9 "Khóa lại bộ bài giữ lại B-19"). Hash mới, `--check` và CT-09/12/13/19 do data-scientist điền trước lượt A/B đầu. Bằng chứng: `docs/research/self-improvement/holdout-relock-2026-11-04.md` §1–§3. Sau khi băm thì đổi ghi chú này thành "đã khóa lại (<commit>)" |

### 2.3 Dòng "Trạng thái 4/11/2026" dưới tiêu đề từng mục của §5

Mỗi dòng chèn **ngay sau** dòng tiêu đề `### B-xx — …` tương ứng, cách một dòng trống, và trước blockquote hoặc bảng sẵn có.

- Sau `### B-12 — Đo recall của cổng chất lượng bằng bộ bài cài lỗi …`:

```markdown
> **Trạng thái 4/11/2026: E2 (thí điểm) xong, chỉ có mô tả, chờ E4.** q̂_b02 = q̂_cto = 0 (0/8 cặp mỗi cổng ở bản gộp; 0/6 khi bỏ 6 lượt "lỡ thấy điểm"). Không có dương thật nên không suy diễn recall và không ước lượng được ρ̂. Ở b10, B7cab và B7cabO mỗi arm chặn 1/4 cặp, B6 chặn 0/4. E2 không có lượt sạch. N của E4 giữ R_E4 = 16 (128 lượt) và R_B6 = 32 (64 lượt), cố định trước dữ liệu (`preregistration.md` §9 khối (a) bước 5). Bằng chứng: `bench/vs-claude/results/gates-pilot/RUNLOG.md`; `context/k4-e2-descriptive-b14-step2-n.md` §1. Câu "Không có lượt nào được chạy" ở blockquote dưới là trạng thái lúc viết (3/11).
```

- Sau `### B-14 — Chẩn đoán cache claude-cli, rồi ổn định tiền tố …`:

```markdown
> **Trạng thái 4/11/2026: bước 1 xong, bước 2 đã đăng ký, chưa chạy.** E1 (7 lượt `claude -p`, CLI 2.1.318, `a4665c6`) cho kết quả: (a) giống hệt h = 0,98; (b) khác bộ công cụ h = 0,00 (CW 41 464, CR 0); (c) khác `cwd` h = 0,98. Vậy phần ghi cache đến từ **bộ công cụ đổi theo pha**, không từ `cwd`. Giả thuyết ở trường 3 khớp. TTL thật chưa xác định vì trường usage không có thông tin này. Bước 2 là A/B công tắc `runtimes.claude-cli.stablePrefix` (bộ công cụ cố định, hook chặn theo pha), đăng ký ở `preregistration.md` §9 (v2.5): B7 tắt/bật × t2-orders, t3-api, t4-perf × 16 lượt = 96 lượt, thước đo chính ln(token có trọng số), hoán vị phân tầng hai phía α = 0,05. Hiệu ứng kế hoạch 10 % là giả định. Bước 2 không thay E4. Còn chờ: giám đốc duyệt (trường 9) và bộ test lệnh ác ý (trường 7(c)). Bằng chứng: `bench/vs-claude/results/b14-diag/RUNLOG.md`; `context/k4-e2-descriptive-b14-step2-n.md` §2.
```

- Sau `### B-16 — Thí điểm "CTO Opus + nghiệm thu brief" …`:

```markdown
> **Trạng thái 4/11/2026: thí điểm 12 cặp (E2) xong, chỉ có mô tả, chờ E4.** q̂_cto = 0 ở cả hai arm (0/4, CP [0; 0,60]), nên tỉ lệ nghiệm thu sai và H-O1 chưa ước lượng được. Bất đồng giữa hai arm bằng 0. Token có trọng số TB/lượt: B7cab 77 657, B7cabO 102 742 (gộp); 78 182 và 105 915 khi bỏ 6 lượt "lỡ thấy điểm". Không so trực tiếp vì pha `accept` khác model. Điểm dừng "có hại" không đánh giá được (không có lượt sạch). E4 giữ R = 16, có McNemar ghép cặp. Bằng chứng: `bench/vs-claude/results/gates-pilot/RUNLOG.md`; `context/k4-e2-descriptive-b14-step2-n.md` §1.2–§1.4.
```

- Sau `### B-19 — Triển khai vòng tự cải thiện RQ5 …`:

```markdown
> **Trạng thái 4/11/2026: khóa lại bộ giữ lại đã duyệt, chờ băm; chưa có lượt A/B nào.** D11 (`902fc78`) làm lệch hash cả 10 bài, và CT-09/12/13/19 đỏ đúng thiết kế. Rà diff `8b0b6c3..902fc78`: không đổi `repo/`, không lộ đáp án, đối xứng giữa các nhánh. `l3-reconcile` đổi `brief` (một câu định nghĩa "duplicate row", `096e47d`). Research-lead chọn phương án (A): chấp nhận và ghi thành sai lệch có tên (`preregistration.md` §9 "Khóa lại bộ bài giữ lại B-19"). Hệ quả: ước phương sai của `l3` đo trên `brief` cũ, và `l3` có thể tiến gần trần. Việc còn lại trước lượt A/B đầu (data-scientist): `--hash`, cập nhật `holdout-lock.json`, `--size`, `--check`, CT xanh, điền bảng hash cũ/mới ở §9. Bằng chứng: `self-improvement/holdout-relock-2026-11-04.md`.
```

---

## Phần 3 — Kiểm sau khi chèn (người chèn chạy)

```
node docs/research/scripts/consistency-check.mjs
node --test bench/vs-claude/harness/stats.test.mjs
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
git diff --stat -- docs/research/preregistration.md docs/research/improvement-backlog.md   # chỉ có dòng thêm, trừ 8 ô của bảng §0 backlog
```
