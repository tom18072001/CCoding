# K3 (BRIEF-18): hai điểm treo — arm null trên t2-orders/t4-perf; bộ test lệnh ác ý của `stablePrefix` (04/11/2026)

Phân loại dữ liệu: **Nội bộ**. Tác giả: methodologist. Không xem điểm E3, E4, E6; không chạy lệnh nào (chỉ đọc tệp). Mọi số "tính tay" dưới đây là số học trên các số đã công bố ở nguồn, không phải dữ liệu mới.

## Tóm tắt

- **(a)** Hai bài có sàn cao làm H6 nghiêng về phía **"tương đương giả"**, không về phía suy biến: khoảng điểm còn lại 0,47 (t2) và 0,16 (t4) làm Δ trung bình co lại khoảng 19 % và SE co khoảng 16 % so với 7 bài đủ dải (tính tay, giả định hiệu ứng tỉ lệ với dải còn lại). Ở t4, chênh oracle − nearmiss (0,05) **bằng đúng** biên ±0,05. Không đổi bài hay tham số trong đợt 3e; thêm một phân tích độ nhạy **mô tả** "bỏ t2, t4" (khối §9 mới, nhãn "đặt trước dữ liệu E6").
- **(b)** Trong 8 ca của B-14 trường 7, **5 ca có test ở chế độ `stablePrefix`** (`; rm`, `$(...)`, `> tệp`, `tee`, `sed -i`), **3 ca thiếu** (heredoc, `awk 'BEGIN{system(...)}'`, `.env`) — chúng chỉ có trong `shell-policy-adversarial.test.ts`, bộ này **không bật `stablePrefix`**. Kết luận (7): **chưa đủ, chờ D13 K6**.

## (a) Arm null ăn điểm cao trên `t2-orders` (0,53) và `t4-perf` (0,84)

### a.1 Dữ kiện

| Bài | oracle | null | nearmiss | Dải còn lại 1 − null | oracle − nearmiss | Nguồn |
|---|--:|--:|--:|--:|--:|---|
| t2-orders | 1,00 | 0,53 | 0,98 | 0,47 | 0,02 | `context/d11-suite-review-2026-11-04.md:125` |
| t4-perf | 1,00 | 0,84 | 0,95 | 0,16 | 0,05 | `d11-suite-review-2026-11-04.md:127` |

- Cả hai là ngoại lệ "có từ trước" của quy tắc null ≤ 0,25 (27/29 bài đạt) — `d11-suite-review-2026-11-04.md:130`.
- Cả hai nằm trong tập 7 bài của H6 (`l1-modules`, `l2-chain`, t1–t5): `preregistration.md:662` (mục (3)). Null của 5 bài còn lại: `l1-modules` 0,00, `l2-chain` 0,01, `t1` 0,00, `t3` 0,13, `t5` 0,01 (`d11-suite-review-2026-11-04.md:113,115,124,126,128`).
- Quy tắc H6 (không đổi): Δ = trung bình theo bài của (điểm A − điểm B0), biên ±0,05, quy tắc trần/suy biến v2.1 (a)–(d), p theo SR-26 — `preregistration.md:660,664,665`. Theo `results/local-3e/RUNLOG.md:27,35`, lúc ghi (13:50 ngày 4/11) chưa có lượt E6 nào và H6 dùng p của SR-26.
- **Giả định ghi rõ:** điểm lượt agent ≥ null (agent không làm hỏng test sẵn có). Nếu agent phá được test sẵn có thì dải thật rộng hơn (tới 1,00) và các hệ quả dưới đây yếu đi; chưa kiểm chứng, vì không xem điểm.

### a.2 Dải điểm và độ nhạy của Δ (tính tay)

Δ trung bình = (1/7) Σ Δ_i, với |Δ_i| ≤ dải còn lại của bài i (theo giả định trên).

| Đại lượng | Tính | Giá trị |
|---|---|--:|
| Biên so với dải t2 | 0,05 / 0,47 | 10,6 % |
| Biên so với dải t4 | 0,05 / 0,16 | 31,3 % |
| Đóng góp tối đa của t2 vào Δ trung bình | 0,47 / 7 | ±0,067 |
| Đóng góp tối đa của t4 | 0,16 / 7 | ±0,023 |
| Đóng góp tối đa của cả hai | 0,63 / 7 | ±0,090 |
| Dải trung bình 7 bài | (1 + 0,99 + 1 + 0,87 + 0,99 + 0,47 + 0,16) / 7 = 5,48 / 7 | 0,783 |
| Dải trung bình 5 bài (bỏ t2, t4) | 4,85 / 5 | 0,970 |

Đọc: **t4 một mình không thể đẩy Δ ra ngoài ±0,05** (0,023 < 0,05) kể cả khi một arm về đúng null ở mọi lượt; t2 một mình chỉ làm được ở cực đoan đó (0,067 > 0,05). Hai bài cộng lại đóng góp tối đa ±0,09.

### a.3 Khả năng phân biệt giữa các arm trên hai bài này

- **t4:** chênh oracle − nearmiss = 0,05 = biên ±0,05. Một lời giải "gần đúng" cách lời giải đúng đúng bằng biên tương đương, nên phép kiểm H6 **không thể coi một lỗi cỡ nearmiss là khác biệt**. **t2:** chênh 0,02 < biên: nearmiss nằm gọn trong biên. (Cùng tính chất ở `t3`: 0,99, chênh 0,01 — ngoài phạm vi điểm treo này, nêu để biết; `d11-suite-review-2026-11-04.md:126`.)
- Nếu hiệu ứng thật của arm tỉ lệ với dải còn lại (một **giả định**, không phải kết quả), Δ trung bình của 7 bài = f × 0,783 so với f × 0,970 của 5 bài, tức **co lại 0,783 / 0,970 = 0,807** (mất 19,3 %). Ví dụ số: nếu 5 bài đủ dải cho 0,060 (ngoài biên) thì 7 bài cho ≈ 0,060 × 0,807 = 0,048 (trong biên).
- SE: nếu độ lệch chuẩn của Δ_i tỉ lệ với dải, SE ∝ √Σ dải²: Σ dải² = 1 + 0,9801 + 1 + 0,7569 + 0,9801 + 0,2209 + 0,0256 = 4,9636, √ = 2,228; so với 7 bài đủ dải √7 = 2,646: tỉ lệ 0,842 (SE co ≈ 16 %).

### a.4 Hướng nghiêng

- **Về phía "tương đương giả" do sàn cao:** cả Δ trung bình lẫn SE đều co ⇒ CI hẹp hơn và gần 0 hơn ⇒ dễ lọt vào ±0,05 hơn so với một bộ bài đủ dải. Đây là thiên lệch chống bảo thủ (anti-conservative) cho kết luận "không kém".
- **Suy biến do trần (v2.1 (b)–(c), `preregistration.md:665`):** không phải kênh chính của sàn cao. Nó chỉ thành vấn đề phụ nếu arm đạt ≥ 0,99 ở mọi lượt của t4 (nearmiss 0,95 nên điều này khả dĩ): khi đó t4 bị loại khỏi phép tương đương của cặp theo (b) và H6 còn 6 bài; nếu mọi Δ\* bằng nhau thì p = NA theo (c). Hai kênh khác hướng nhưng không triệt tiêu nhau.
- Với r = 3/2/3 lượt mỗi ô, §2.5 đã dự báo H6 "Không kết luận" (`preregistration.md:665`, câu cuối). Vì vậy tác động lên **phán quyết** ở 3e là bậc hai; tác động chính là lên cách đọc ước lượng mô tả và lên thiết kế lần sau.

### a.5 Có cần phân tích độ nhạy "bỏ hai bài" không

**Có, chỉ mô tả.** Khi báo H6, kèm: (i) Δ và CI trên 5 bài (không t2, t4); (ii) Δ_i từng bài kèm dải 1 − null; (iii) cờ "nhạy với bài" nếu Δ̂ đổi phía so với 0 hoặc CI đổi vị trí so với ±0,05. **Không thêm p, không vào họ Holm, không đổi phán quyết chính.** Khối §9 ngắn ở cuối `preregistration.md` ghi điều này (nhãn "đặt trước dữ liệu E6": theo `local-3e/RUNLOG.md:27`, chưa có lượt E6; thư mục `results/h6-3e` chưa tồn tại ở nhánh này).

### a.6 Đề xuất cho lần đo sau (không áp dụng ở đợt 3e)

| # | Đề xuất | Lợi | Cái giá / lưu ý |
|---|---|---|---|
| 1 | Thêm test ẩn khiến null thất bại (hạ sàn null ≤ 0,25) ở t2, t4 | Khôi phục dải; sửa gốc | Đổi `hidden/` ⇒ phải rà diff và khóa lại như SR-05…SR-24; không dùng chung dữ liệu cũ |
| 2 | Chuẩn hóa (score − null) / (oracle − null) làm phân tích phụ | So sánh Δ giữa bài công bằng | Mẫu số 0,16 ở t4 nhân phương sai ≈ 1/0,16² ≈ 39 lần: phải cắt/ghi cờ; chỉ làm độ nhạy |
| 3 | Tiêu chí nhận bài vào họ H: null ≤ 0,25 (và có thể oracle − nearmiss ≥ biên 0,05) | Chặn bài không phân biệt ngay từ đầu | Theo bảng d11: null ≤ 0,25 loại t2, t4; thêm "oracle − nearmiss ≥ 0,05" còn loại `l1-modules` (0,03), `t2` (0,02), `t3` (0,01), `t5` (0,03) — cần cân nhắc vì loại nhiều bài (`d11-suite-review-2026-11-04.md:113,125,126,128`) |
| 4 | Báo Δ_i theo bài song song Δ trung bình | Lộ bài nào "ăn sàn" | Không tốn lượt chạy |

## (b) Bộ test lệnh ác ý cho `stablePrefix` (B-14 trường 7(c))

### b.1 Cơ chế cần kiểm

- Hook `src/tools/claude-guard.ts`: khi `cfg.stablePrefix`, **trước** mọi phân tích lệnh, pha chỉ đọc (mọi pha khác `execute`/`revise`, kể cả thiếu) chặn **toàn bộ** `Bash`/`PowerShell` và công cụ ghi (`claude-guard.ts:56-60,91-97`; mã quy tắc `read-only-phase`). Công cụ không nằm trong `callTools` bị chặn `tool-not-granted` (`:94-95`).
- Phân tích lệnh bằng regex/tách câu (`deniedReason`, `gitReadViolation`) **không** chạy ở pha chỉ đọc của chế độ này; chỉ chạy ở `execute`/`revise` qua chính sách cũ (`:98-111`). Vì vậy bất biến cần kiểm ở pha chỉ đọc là "mọi lệnh bị chặn, bất kể nội dung".
- `.env`: `Read`/`Grep`/`Glob` **không** bị `read-only-phase` chặn, nên chặn `.env` ở pha chỉ đọc dựa vào nhánh `FILE_TOOLS` (`:112-125`, `SECRET_FILE` ở `:61`, `:120`, `:124`); lệnh Bash chứa `.env` bị chặn ở `:103`.

### b.2 Bảng đối chiếu 8 ca

"Bộ stable" = `test/claude-stable-prefix.test.ts` (`guardDecision` với `stablePrefix: true`, dòng 49-50). "Bộ shell-policy" = `test/shell-policy-adversarial.test.ts` (`cfg` ở dòng 9 là `shell: 'git-read'`, **không** có `stablePrefix`).

| # | Ca (B-14 trường 7) | Có test? | Test + dòng | Chế độ kiểm |
|--:|---|---|---|---|
| 1 | `; rm` | **Có** | Bộ stable: `EVIL[0]` = `echo x; rm -rf src` (dòng 52), khẳng định ở dòng 54-59 (5 pha chỉ đọc, khớp `/chỉ đọc/`). Thêm ở bộ shell-policy: dòng 43-48 | **`stablePrefix`** (và shell-policy chung) |
| 2 | `$(...)` | **Có** | Bộ stable: `echo $(rm -rf src)` và `` echo `id` `` (dòng 52, kiểm ở 54-59). Bộ shell-policy: dòng 49-51 | **`stablePrefix`** (và shell-policy chung) |
| 3 | heredoc | **Không** (ở `stablePrefix`) | Chỉ bộ shell-policy: dòng 54-55 (`cat <<EOF`, `<<<`), 84 (`python3 - <<'E'`) | **Chỉ shell-policy chung** |
| 4 | `> tệp` | **Có** | Bộ stable: `echo hi > a.txt` (dòng 52, kiểm ở 54-59). Bộ shell-policy: dòng 57-63 (`>`, `>>`, `&>`, `2>`) | **`stablePrefix`** (và shell-policy chung) |
| 5 | `tee` | **Có** | Bộ stable: `echo hi \| tee a.txt` (dòng 52). Bộ shell-policy: dòng 64 | **`stablePrefix`** (và shell-policy chung) |
| 6 | `sed -i` | **Có** | Bộ stable: `sed -i s/a/b/ f.ts` (dòng 52). Bộ shell-policy: dòng 65-66 | **`stablePrefix`** (và shell-policy chung) |
| 7 | `awk 'BEGIN{system(...)}'` | **Không** (ở `stablePrefix`) | Chỉ bộ shell-policy: dòng 70-80 (`system`, `getline`, ghi tệp, `-f`, `-i`…) | **Chỉ shell-policy chung** |
| 8 | `.env` | **Không** (ở `stablePrefix`) | Chỉ bộ shell-policy: dòng 87-91 (`cat .env`, `".env"`, `.e""nv`, `.env.local`, `git show HEAD:.env`) và dòng 132 (`gitReadViolation('cat .env')`). Bộ stable: dòng 63 chỉ đọc `a.ts`, không có `.env` | **Chỉ shell-policy chung** |

Ghi chú: (i) ca 1-6 ở bộ stable cùng nằm trong danh sách `EVIL` (dòng 52) — danh sách này còn có `node -e …writeFileSync`, `ls`, `git status`, `npm test`; (ii) bộ stable khẳng định bằng `/chỉ đọc/`, nên một lệnh bị chặn vì lý do khác (vd. `outside-root`) sẽ **không** qua — đây là thiết kế tốt, giữ khi thêm ca; (iii) test dòng 73-80 xác nhận pha `execute`/`revise` vẫn cho `npm test` và chặn `git push`, nhưng **không** đưa lệnh ác ý vào `execute` dưới `stablePrefix`; B-14 trường 7(c) và mục (7) §9 nói về pha chỉ đọc, nên không coi đó là thiếu.

### b.3 Ca thiếu → danh sách cho D13 K6

Mỗi ca dùng cùng khung `hook(...)` của `claude-stable-prefix.test.ts:49-50` (`stablePrefix: true`, `callTools: [...STABLE_TOOLS]`). Kết quả mong đợi là chặn ở pha chỉ đọc; pha dùng: `plan`, `review`, `synthesize`, `accept`, `finalize` (như dòng 55).

| Ca | Lệnh / lời gọi ví dụ | Kết quả mong đợi dưới `stablePrefix: true` |
|---|---|---|
| 3 heredoc | `Bash`: ``cat <<'EOF' > a.txt\nx\nEOF`` và ``cat <<EOF\nx\nEOF`` | `guardDecision` ≠ `undefined`, khớp `/chỉ đọc/` ở mọi pha chỉ đọc (mã `read-only-phase`) |
| 7 awk | `Bash`: `awk 'BEGIN{system("rm -rf src")}'`, thêm `awk 'BEGIN{"id" \| getline x; print x}'` và `awk -f prog.awk f` | Như trên: khớp `/chỉ đọc/` |
| 8 `.env` (Bash) | `Bash`: `cat .env`, `grep KEY app/.env.local` | Khớp `/chỉ đọc/` ở pha chỉ đọc. Ở `execute`: bị chặn bởi `env-file` (`claude-guard.ts:103`); nên khẳng định khớp `/\.env/` |
| 8 `.env` (công cụ đọc) | `Read` với `file_path: ${root}/.env`; `Grep`/`Glob` với `path: ${root}/.env.local` ở `phase: 'plan'` | Chặn bởi `env-file` (`claude-guard.ts:120`), thông báo chứa `.env` (khẳng định `/\.env/` để không qua nhầm bằng `outside-root`). Đối chứng: `.env.example` **không** bị chặn (`SECRET_FILE`, `:61`) |

Đề nghị thêm (không bắt buộc cho kết luận (7)): `echo x >> a`, `git log 2> e`, `cat <<< x` dưới `stablePrefix` để phủ biến thể của ca 3-4 (hiện chỉ ở bộ shell-policy, dòng 55, 57-63).

### b.4 Kết luận (7)

**Chưa đủ, chờ D13 K6.** 5/8 ca có test ở đúng chế độ; 3/8 (heredoc, awk system, `.env`) mới chỉ có ở shell-policy chung — bộ này chạy không bật `stablePrefix` (`shell-policy-adversarial.test.ts:9`), nên không chứng minh được bất biến ở chế độ cần đo. Hiện `npm test` 415/415 xanh ở `8c6d2d1` (theo RUNLOG b14-step2 dòng 12; tôi không chạy lại). Điều kiện (7) chỉ thỏa khi D13 K6 thêm ba ca trên **và** bộ test xanh trên commit ghim.

## Tệp đã dẫn (đã đọc, chỉ đọc)

`context/d11-suite-review-2026-11-04.md` §4; `preregistration.md:658-669,876-891`; `bench/vs-claude/results/local-3e/RUNLOG.md:27,35`; `bench/vs-claude/results/b14-step2/RUNLOG.md`; `improvement-backlog.md:281`; `src/tools/claude-guard.ts:56-133`; `test/claude-stable-prefix.test.ts`; `test/shell-policy-adversarial.test.ts`.
