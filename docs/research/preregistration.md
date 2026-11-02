# Đăng ký trước giả thuyết — bản 2.0 (khóa có điều kiện)

> Phân loại dữ liệu: **Nội bộ** (benchtest trên bài tổng hợp, không có DLCN). Bản 1.0: @methodologist, nhiệm vụ T-20261102-134405-b2c (S2), 2/11/2026. Bản 2.0: @methodologist, hạng mục S4 (R6) của nhiệm vụ T-20261102-175854-65c, 2/11/2026.
> Trạng thái: **v2.0, khóa có điều kiện** (xem §8). Có hiệu lực khi (i) commit gộp có hash điền vào §8 và (ii) các SR P0 của `suite-review.md` mà từng giả thuyết đang chờ (cột "Khóa" ở §3.1) được đóng hoặc được ghi vào §9. Sau khóa chỉ sửa bằng bảng §9, không sửa lặng lẽ. Nếu một SR P0 làm đổi phép kiểm hay ngưỡng thì ghi **v2.1** vào `CHANGELOG.md`, không cần một vòng đăng ký mới.

## Tóm tắt

Bản 2 đổi hệ chính sang bộ đo của giám đốc (`bench/vs-claude`, commit `1568774`): **H1–H10 của `analyze.mjs` giữ nguyên mã và nguyên nghĩa của giám đốc**. Chín giả thuyết của bản 1 (không phải 8 như đề bài viết) đổi mã theo số thứ tự thành **P1–P9** và chỉ còn là bộ phụ cho t1–t5 (§3.3, bảng ánh xạ P↔H). Thêm hai nhóm giả thuyết mới: **B-01** (làn đơn tương đương ±15 % so với A0-sonnet, ba phép TOST) và **B-02** (cổng chặn ca "đỏ kéo dài và bỏ sót phần việc" như t5, kèm B-10). Tiêu chí loại lượt (hạn mức, `leak`, timeout) áp cho bộ mới ở §4.3.

Ba điều cần chủ dự án biết trước khi khóa:
- **Chỉ 4–5 trong 10 H kiểm được trước 5/11.** Theo `run-plan.md` §4: H1, H2, H3, H5, H6 đạt ở cả hai nhánh; H4 chỉ đạt khi Phòng Dev merge; H7 chỉ đạt ở Nhánh 1; **H8, H9, H10 không đạt** (do thiết kế phép kiểm, không do hạn mức) nên đăng ký là **mô tả/thăm dò**, không ra quyết định. B-02 kiểm chứng thống kê cũng không đạt; chỉ kiểm được cơ chế.
- **Công suất thấp ở H1, H2:** chỉ 4 bài nên p hoán vị không xuống dưới 0,125 (`suite-review.md` §3); họ Holm không bác bỏ được bằng p này. Phán quyết của giám đốc (`est`/`lo`) vẫn được báo, kèm CI, nhưng đăng ký trước dự báo "Không kết luận" cho p của H1, H2.
- **Tám SR P0 đang chờ Phòng Dev** (SR-01…SR-08, §9): trong đó SR-01 (lượt hỏng bị coi là đã xong) và SR-03 (không ghi hash CCoding) ảnh hưởng mọi H. Tôi không chờ chúng để viết bản này, nhưng H bị ảnh hưởng đều ghi "khóa có điều kiện: chờ SR-xx".

## Tệp đã lưu

- `docs/research/preregistration.md` (tệp này, v2.0, sửa tại chỗ từ v1.0) và dòng v2.0 trong `docs/research/CHANGELOG.md`. Không sửa `src/`, `bench/`.
- Đầu vào đã đối chiếu: `docs/research/suite-review.md` (S1; bảng H1–H10 mục 3, SR-01…SR-24 mục 5); `docs/research/run-plan.md` (S2; §4 số lượt tối thiểu, §6 gộp harness, §3.0 quy tắc cửa sổ); `docs/research/improvement-backlog.md` (S3; B-01 §3, B-02 §4.1 bước 2, B-10 §5, §6 ánh xạ); mã `bench/vs-claude/run.mjs` dòng 33–34, 47–53, 62–64, 87–91, 137–145, 169–176; `lib/ccoding.mjs` dòng 33–40, 68–72; `lib/claude.mjs` dòng 31, 50–53; `analyze.mjs` dòng 11–12, 15–16. Các dòng `analyze.mjs` khác lấy từ `suite-review.md` §3; kiểm lại bằng `grep -n` trước khi khóa.
- Bản 1.0 đã đối chiếu: nội dung P1–P9 giữ từ v1.0 (đổi mã; rút gọn cách trình bày, giữ phép kiểm, ngưỡng, n, kết quả bác bỏ).

## 1. Thiết kế & RQ

**RQ-V3 (giữ từ bản 1).** Với việc nhỏ, làn nhanh của CCoding so với Claude Code đơn cùng mô hình Sonnet chậm hơn và đắt hơn bao nhiêu, chất lượng có giữ được không, và từ cỡ việc nào thì điều phối đa tác tử có lợi?
**RQ-V4 (mới).** Trên bộ đo của giám đốc (13 bài, 6 loại), CCoding (B0) có lợi gì so với agent đơn (A0-sonnet, A1, A2) theo H1–H10; làn đơn (B-01) có đạt tương đương ±15 % và cổng chất lượng (B-02, B-10) có chặn được ca t5 không?

**Thiết kế: thực nghiệm đối chứng xen kẽ, phân tầng theo bài, có lặp.** `run.mjs:47-53` xếp lịch với vòng ngoài là lượt lặp, mỗi bài trộn bằng hạt `${seed}/${r}`, arm xoay `(r + ti) % k`: đây là xen kẽ có xoay, **không phải ngẫu nhiên hóa hoàn toàn** (với k = 2 và 13 bài, arm đứng đầu 7/6; `suite-review.md` §3). Đơn vị phân tích của `analyze.mjs` là **bài** (delta của trung bình mỗi bài; bootstrap 4000 lần, hoán vị đổi dấu 10 000 lần).

| Phương án | Ưu | Nhược | Quyết định |
|---|---|---|---|
| A. Dùng bộ đo giám đốc làm hệ chính, bộ cũ t1–t5 làm hệ phụ (chọn) | Theo chỉ đạo của giám đốc; có arm A1/A2 cùng tính toán; có oracle/null, `leak`, pairwise | Chỉ 1 bài cho H3, H4, H9; 4 bài cho H1, H2; `size` chưa định nghĩa | Chọn |
| B. Chỉ giữ bản 1 (t1–t5, C9) | Có σ thật | Trái chỉ đạo; chỉ làn nhanh; bài đã dùng để tinh chỉnh | Bộ phụ P1–P9 |
| C. Gộp hai bộ trong một họ Holm | Nhiều dữ liệu | Grader, hệ đo token, phiên bản CCoding khác nhau (`run-plan.md` §6.2) | Không gộp |

**Hệ so sánh.** BASE mặc định `A0-sonnet`, TREAT mặc định `B0` (`analyze.mjs:15-16`). Các arm khác: A0-opus, A1 (đơn có lập kế hoạch và tự review), A2 (best-of-N cùng tính toán), B1–B5, làn nhanh `FL`, làn đơn `SL` (tên tạm của arm B-01, dùng đúng tên Phòng Dev đặt trong `arms.json`), oracle, null.

**Bài.** 13 bài: coding c1–c5; logic l1–l4; review s1; requirements a1; design r1; research re1. Bộ cũ t1–t5 vào bộ đo bằng `task.json` (Phòng Dev đang làm). Chưa merge thì chỉ 9 bài chạy được (`a1, l1, l2, r1` lỗi ENOENT do thiếu `repo/`; `run-plan.md` §3.1).

## 2. Đo lường & mẫu

### 2.1 Biến đo và nguồn

| Biến | Trường trong `runs.jsonl` (`run.mjs:169-174`) | Dùng ở |
|---|---|---|
| Điểm | `score` ∈ [0,1] (grader theo loại bài), `pass`, `details` | H1–H4, H6, H7, H9, H10, B-01(c), B-02 |
| Token có trọng số | `tokens.weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·output` (`claude.mjs:15-17`) | H5, B-01(a) |
| Thời gian thực | `wallSec` | H5, B-01(b) |
| USD | `costUsd` (**arm B luôn bằng 0 ở nhánh `calls.jsonl`**, `ccoding.mjs:46-62`; chờ SR-02) | chỉ độ nhạy của B-01(a) |
| Tỉ lệ thiếu sản phẩm | `formatMiss` (`gradeCode` không bao giờ đặt, `grade.mjs:40`) | H8 |
| Phụ | `tokens.cacheWrite/cacheRead/output`, `turns`, `calls`, `agentsUsed`, `byPhase`, `size`, `category`, `status`, `error`, `leak` | mô tả, P8, §4.3 |

**Khóa vào chỉ số chính.** Chỉ số chi phí chính là **token có trọng số đúng như `analyze.mjs`** để khớp hệ đánh giá của giám đốc. **USD ước tính theo bảng giá là phân tích độ nhạy**, chưa chạy được trước SR-02; trước đó, mọi kết luận "tương đương" chỉ nói về token có trọng số, không suy ra tương đương USD (`suite-review.md` §4.2). Trọng số `5 × output` chỉ đúng trong một model (`suite-review.md` §4.1): luôn báo kèm bảng token thô và tỉ lệ `cacheRead/total` mỗi arm.

### 2.2 Mẫu: số lượt mỗi ô

Mặc định `--repeats 3` (`README.md:47`). Số lượt tối thiểu cho từng giả thuyết lấy từ `run-plan.md` §4; bảng đầy đủ ở §3.1. Nguồn n của bộ cũ (P1–P9) giữ từ bản 1:

| Nguồn | Lệnh hoặc công thức |
|---|---|
| `docs/research/performance/required-runs-2026-11-02.md` mục 2, 4–5 | `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim --delta wall=30,cost=0.1` (và `--delta wall=<Δ>` kèm `--tasks <bài>`) |
| Công thức | n mỗi nhánh = 2·(z₁₋α + z₁₋β)²·σ²/Δ²; SE² nhiều tầng = (1/K²)·Σₜ(σ²ₜ,CC/n_CC + σ²ₜ,Cl/n_Cl) |
| TOST (`run-plan.md` §4) | n/arm = 2σ²(1,645 + 1,282)²/m², m = ln 1,15 = 0,140; công suất 80 % tại chênh lệch thật bằng 0 |

σ bộ cũ (thời gian, s): t1 88,6; t2 28,1; t3 143,9; t4 162,7; t5 110,7; σ chi phí (USD): 0,297; 0,220; 0,344; 0,340; 0,434 (gộp C1–C8, là cận trên). Giả định CV 25 % cho làn nhanh, 8 % cho Sonnet, 30 % cho cache_write (mỗi con số là giả định, kiểm bằng sd quan sát ở C9). **σ của bộ mới (recall s1 = 0,12; a1 = 0,17; re1 = 0,15; σ log TOST 0,10–0,29) đều là giả định của `run-plan.md`, chưa có `results/pilot*`.**

**Quy ước α:** mọi kiểm định xác nhận một phía ở mức 0,025 (CI 95 % hai phía); riêng TOST của B-01 dùng α = 0,05 mỗi phía, tức bootstrap 90 % CI hai phía. Công suất 0,8.

### 2.3 Công cụ có và chưa có

| Cần | Có không? |
|---|---|
| Bootstrap theo bài (4000), hoán vị đổi dấu (10 000), độ dốc OLS có hoán vị 5000 (H10) | **Có** trong `analyze.mjs` (`compare` `:38-53`; H10 `:109-114`), nhưng H10 xáo bằng `.sort(() => rnd() - 0.5)` không đều (SR-05) |
| TOST / CI nằm trong biên | **Không** (chờ SR-04). `analyze.mjs` phán H2 và H6 bằng ước lượng điểm (`:67`, `:89-90`) |
| Loại lượt hỏng (hạn mức, timeout), ghi hash CCoding | **Không** (SR-01, SR-03) |
| `stats.mjs` (bộ cũ: `ratioCI`, `--exclude-run`, `--required-runs`) | **Có**, chỉ cho `harness/` (C1–C9) |
| Kiểm định điểm tỉ lệ (P3), TOST (P9→B-01) cho bộ cũ | **Không** (`prereg-tests.mjs` chưa tồn tại) |

**Phương án lùi đã đăng ký (dùng khi SR-01/SR-04 chưa xong khi chạy):** (i) lọc lượt theo §4.3 trên **bản sao** `runs.jsonl` (bản gốc giữ nguyên) trước khi chạy `analyze.mjs`; (ii) tính TOST bằng một script ngoài đọc `runs.jsonl` (bootstrap 90 % CI theo bài trên log-tỉ số, hạt 20261102); script đó phải có test và hash ghi vào §8 trước khi mở dữ liệu chính. Mọi lần dùng phương án lùi ghi vào §9.

### 2.4 Hợp nhất kết luận (ba trạng thái)

- **Xác nhận:** qua phép kiểm của giả thuyết (mức Holm nếu thuộc họ) **và** CI phía liên quan vượt biên.
- **Bác bỏ:** CI nằm hoàn toàn phía bên kia của biên so với hướng kỳ vọng.
- **Không kết luận:** còn lại. Không gọi là "bằng chứng cho giả thuyết rỗng". Với H nằm cột "Không đạt trước 5/11" ở §3.1, trạng thái tối đa là **"mô tả"** (báo ước lượng và CI, không phán SUPPORTED/REJECTED làm căn cứ quyết định).

### 2.5 Họ giả thuyết chính và Holm

- **Họ chính Holm (K = 4):** H1, H2, H3, H6 (phép kiểm có hướng trên điểm, đạt số lượt ở cả hai nhánh, `run-plan.md` §4). Sắp p một phía tăng dần p₍₁₎ ≤ … ≤ p₍₄₎; bác bỏ H0 thứ i nếu p₍ᵢ₎ ≤ 0,025/(4 − i + 1), dừng ở lần đầu thất bại. H3 là hợp giao (recall và precision): p(H3) = max của hai p. H2 và H6 là kiểm định không-vượt/tương đương (SR-04): p của phía có kết quả kém hơn.
- **Nguồn p.** `analyze.mjs` chỉ in p hoán vị cho `compare` (H1, H2; `suite-review.md` §3). Với H3, H6 chưa có p: dùng phương án lùi của bản 1 là p = tỉ lệ mẫu bootstrap (theo bài) vượt biên.
- **Không vào họ Holm:** **H5** (tỉ lệ bài đạt ngưỡng, `analyze.mjs:84`; mô tả có ngưỡng, không có suy diễn); **H4** (phụ: chỉ đạt khi Phòng Dev merge; 1 bài); **H7** (kiểm riêng, α = 0,025 một phía; chỉ đạt ở Nhánh 1); **H8, H9, H10** (không đạt: mô tả/thăm dò).
- **B-01**: họ riêng, hợp giao (IUT) của ba TOST, không hiệu chỉnh thêm. **B-02**: không Holm (cơ chế xác định; chất lượng chỉ mô tả).
- Mọi phân tích theo từng bài, gộp harness cũ, so với Opus, hay chọn sau khi thấy dữ liệu là **khám phá** (§5).

## 3. Kế hoạch phân tích — các giả thuyết

Quy ước chung: `node bench/vs-claude/analyze.mjs <out>` với `--baseline A0-sonnet --treatment B0` (mặc định); mọi lệnh trên **bản sao đã lọc** theo §4.3. Dòng mã `analyze.mjs:N` lấy từ `suite-review.md` §3. Trạng thái "Đạt/Không đạt" theo `run-plan.md` §4: **Đạt** = số lượt tối thiểu nằm trọn trong W1–W5 và phép kiểm có thể ra kết luận cơ học; không có nghĩa kết quả sẽ ủng hộ giả thuyết. B1 = Nhánh 1 (chưa merge Phòng Dev), B2 = Nhánh 2 (đã merge).

### 3.1 Họ chính: H1–H10 của bộ đo giám đốc

| H | Câu giả thuyết (giám đốc) | Phép kiểm và ngưỡng (`analyze.mjs`) | Arm × bài | N tối thiểu | Trước 5/11 | Khóa |
|---|---|---|---|---|---|---|
| **H1** | Việc phân rã được (coding/design, `size ≥ 3`): B0 hơn A0-sonnet | Lọc `:62`; SUPPORTED nếu `est ≥ 0,1 && lo > 0` (`:63`) | A0-sonnet, B0 × c3, c4, c5 (+ r1 khi `repo/` sửa) | r = 3 mỗi ô: 18 (B1) / 24 (B2) | **B1: đạt (W1); B2: đạt (W2)** | chờ SR-01, SR-03, SR-05 (ngưỡng `size ≥ 3`), SR-07 (r1 `--judge`) |
| **H2** | Suy luận ràng buộc (logic): B0 *không* tốt hơn A0-sonnet | Lọc logic `:66`; SUPPORTED nếu `est ≤ 0,05` (`:67`). **Đăng ký thêm:** cận trên CI 90 % của Δ ≤ +0,05 (không-vượt) | A0-sonnet, B0 × l3, l4 (+ l1, l2) | r = 3: 12 (B1) / 24 (B2) | **B1: đạt; B2: đạt (W2)** | chờ SR-01, SR-03, SR-04, SR-16 (tính duy nhất l1) |
| **H3** | Review nâng recall lỗi gieo mà không giảm precision | recall: `m(TREAT) − m(BASE) ≥ 0,15` và precision: `m(BASE) − m(TREAT) ≤ 0,05` (`:70-74`) | A0-sonnet, B0 × s1 | r = 10 mỗi arm: 20 lượt (σ recall = 0,12 giả định) | **B1: đạt (W2); B2: đạt (W2)**, chỉ về s1 | chờ SR-01, SR-03; SR-10 (P1) có thể đổi phép kiểm sang B0 vs B2 → v2.1 |
| **H4** | Phát hiện mơ hồ gieo sẵn (requirements) | Lọc `requirements` `:77`; `est ≥ 0,2` (`:78`) | A0-sonnet, B0 × a1, `--judge` | r = 11 mỗi arm: 22 lượt (σ = 0,17 giả định) | **B1: không đạt** (a1 lỗi ENOENT); **B2: đạt (W4)** | chờ SR-01, SR-03, SR-07, SR-08 |
| **H5** | Chi phí B0/A0: token có trọng số ≥ 3× **và** thời gian ≥ 1,5× ở ≥ 80 % bài | tỉ số trung vị theo bài `:81-82`; đếm `x ≥ 3 && wr[i] ≥ 1,5` (`:83`); SUPPORTED nếu ≥ 0,8 (`:84`) | A0-sonnet, B0 × mọi bài | r = 3 (trung vị): 54 (B1) / 78 (B2) | **B1: đạt (W1); B2: đạt (W1–W2)** | chờ SR-01, SR-03, **SR-06 (lỗi lệch chỉ số `:81-83`)** |
| **H6** | Agent đơn cùng tính toán (A1/A2) ≈ B0 | `|est| ≤ 0,05` với một trong A1/A2 (`:89-90`). **Đăng ký:** báo riêng A1 và A2; kết luận chính = cả hai nằm trong ±0,05 theo CI 90 % (SR-04, SR-12) | A1, A2, B0 × mọi bài | A1 r = 3, A2 r = 2: 45 (B1, W3) / 65 (B2, W5) | **B1: đạt; B2: đạt** | chờ SR-01, SR-03, SR-04; SR-12 (P1) |
| **H7** | Ổn định: SD(B0)/SD(A0) ≤ 0,7 | trung vị tỉ số SD theo bài ≤ 0,7 và ≥ 3 bài (`:93-94`) | A0-sonnet, B0 × mọi bài | r = 5 mỗi ô: 90 (B1) / 130 (B2) | **B1: đạt (W4); B2: không đạt** (cần W6, 14,6 triệu) | chờ SR-01, SR-03; SR-14 (P1) |
| **H8** | Thất bại điều phối (thiếu sản phẩm / bỏ yêu cầu): tỉ lệ `formatMiss` của TREAT > BASE | `fm(TREAT) > fm(BASE)` (`:97-99`); `fail(arm)` coding `:98` | mọi bài | ≈ 100+ mỗi arm (≥ 6 sự kiện) | **Không đạt cả hai nhánh** | chờ SR-01, SR-03, **SR-13 (P1)** |
| **H9** | Bám nguồn (research): precision trích dẫn và từ chối đúng B0 hơn ≥ 10 pp | `dP ≥ 0,1 && dR ≥ 0,1` (`:104-106`); lọc `research` `:102` | A0-sonnet, B0 × re1 | ≥ 35 mỗi arm (trích dẫn); ≥ 75 mỗi arm (từ chối nhị phân) | **Không đạt cả hai nhánh** | chờ SR-01, SR-03, SR-07, SR-08; SR-18 (P1) |
| **H10** | Lợi thế tăng theo kích thước bài (`size`) | độ dốc OLS của delta theo `size` (`:109-111`); hoán vị 5000 (`:112-113`); SUPPORTED nếu `b > 0 && p < 0,05` (`:114`) | A0-sonnet, B0 × mọi bài | thêm lượt không tăng công suất (biến giữa bài, n = 9–13) | **Không đạt cả hai nhánh** | chờ SR-01, SR-03, **SR-05 (định nghĩa `size`, điều chỉnh loại bài, Fisher-Yates)** |

**Ghi chú đăng ký cho từng H** (chỉ những điểm làm đổi cách diễn giải; chi tiết nguy cơ ở `suite-review.md` §3):

- **H1.** Hướng kỳ vọng B0 > A0-sonnet. Với 4 bài, `lo > 0` gần như đòi cả 4 delta cùng dương và p ≥ 0,125. **Trần điểm:** A0-sonnet đạt test ẩn 1,000 trên 36/36 lượt t1–t5 (`run-plan.md` §4 H1), nên Δ ≥ +10 pp có thể không thực hiện được nếu c3–c5 cũng gần trần; kết quả "Không kết luận do trần" được dự báo trước. Ngưỡng `size ≥ 3` được chọn sau khi biết bộ bài (nguy cơ tùy chỉnh theo dữ liệu), nên **đăng ký cố định danh sách bài: c3, c4, c5 và r1**, không đổi sau khi thấy dữ liệu; c1, c2 (gắn H1 trong `task.json` nhưng `size = 2`) ra ngoài H1.
- **H2.** Hướng "B0 không tốt hơn" trộn với "không kém hơn": `est ≤ 0,05` vẫn SUPPORTED khi B0 kém nhiều. Do đó phán quyết **đăng ký** là hai chiều: (i) phán quyết của giám đốc theo `:67`; (ii) CI 90 % của Δ theo bài nằm trong [−0,05; +0,05] để nói "tương đương", hoặc cận trên ≤ +0,05 để nói "không vượt". l1, l2 dễ chạm trần ở cả hai arm.
- **H3.** Phép kiểm so B0 với A0-sonnet, **khác nhau ở cả kiến trúc lẫn review**; hiệu ứng review riêng chỉ đo được bằng B0 so với B2 (review tắt, chỉ in ra ở `:72`). Đăng ký trước đúng phép kiểm giám đốc (`:73`) và **diễn giải chỉ ở mức "B0 so với A0-sonnet trên s1"**; chạy B2 × s1 nếu còn ngân sách (mô tả). Recall có bước 1/7 = 14,3 pp. Báo `decoyHits` riêng (SR-17). Precision NaN khi không có finding: lượt đó không vào trung bình precision, ghi số lượt loại.
- **H4.** Hai điều kiện bắt buộc cho bài này: `--judge` bật cho **mọi** arm của a1 (SR-07) và khóa một chế độ chấm cho cả nghiên cứu. Bước điểm 1/6 = 16,7 pp, ngưỡng 20 pp = 2 mục. `task.json` của l3, r1 gắn H4 nhưng `analyze.mjs` chỉ tính loại `requirements` (= a1): đăng ký theo **mã**, không theo nhãn `hypotheses`.
- **H5.** Chỉ số gồm hai phần cùng phải đạt trên ≥ 80 % bài. **Chỉ số token chính là `tokens.weighted`** (không phải USD); `weighted` bằng `claude.mjs:15-17`. Hai hệ đo token khác nhau (A: `result.usage` của CLI; B: tổng `calls.jsonl`, `ccoding.mjs:46-62`) nên chênh lệch phạm vi đo có thể tạo hệ số giả; báo kèm bảng token thô. Dự đoán từ số liệu cũ: ×4,3–5,5 token, ×2,6–5,3 thời gian (`run-plan.md` §4): ngưỡng rộng.
- **H6.** `.some()` ở `:89-90` làm tăng dương tính giả; A2 cố định n = 3 (`arms.json:21`) không tương đương tính toán của B0 (tỉ số token A2/B0 phải báo). TOST ±5 pp cần ≥ 60 lượt/arm (`run-plan.md` §4): **không đạt công suất**; "Không kết luận" được dự báo trước.
- **H7.** SD 3 lượt có 2 bậc tự do; bài có `sd(A0) = 0` bị loại khi `sd(B0) > 0` (NaN, `:93`): thiên lệch chọn. A0-sonnet có sd = 0 ở cả 5 bài t1–t5 (`run-plan.md`), nên H7 có thể là "thiếu dữ liệu" bất kể N. Báo số bài hợp lệ.
- **H8.** Phán quyết `:99` chỉ dựa vào `formatMiss`; `gradeCode` không bao giờ đặt (`grade.mjs:40`) nên **H8 không bắt được ca coding kiểu t5** (`improvement-backlog.md` §5 B-10 trường 6). Đăng ký ở dạng đúng mã và **mô tả**. **Chỉ số phụ H8b** (đề nghị của S3, chưa có trong mã): tỉ lệ lượt coding có **một nhóm test ẩn hỏng toàn bộ** (nhóm = tiền tố trước `:` của tên test; t5: "tổng hợp" 37/37). Chỉ tính được nếu `details` hoặc `artifacts/<key>/` giữ tên test: **cần kiểm** trước khi khóa; nếu không, H8b tính bằng script ngoài.
- **H9.** `citationPrecision` chỉ kiểm id nằm trong P1–P6 chứ không kiểm trích đúng bài (SR-18). Điều kiện AND trên 3 quan sát nhị phân là rất chặt. Chỉ mô tả; `pairwise` re1 báo kèm.
- **H10.** `size` chưa có định nghĩa, gán không nhất quán (c1 5 quy tắc nhưng `size` 2; l1 3 câu hỏi nhưng `size` 1) và lẫn loại bài; selftest oracle so với null cho độ dốc −3,4 pp/phần, p = 0,061 (`suite-review.md` §4.3). Đăng ký là **thăm dò**: không dùng để hiệu chỉnh ngưỡng `parts`/`filesTouched` của B-01. Nếu SR-05 xong thì báo thêm (i) độ dốc điều chỉnh loại bài hoặc chỉ trong coding (c1–c5: 2, 2, 3, 4, 5), (ii) CI của độ dốc.

**Hiệu lực chung (áp cho cả bảng).** (a) Thứ tự xen kẽ + xoay chưa phải ngẫu nhiên hóa (§1). (b) Cùng runtime `claude-cli` cho A và B (`run.mjs:33`), nhưng B0 dùng lập lịch pha riêng của CCoding và cấu hình model từng pha chưa ghi vào dòng kết quả. (c) **Phiên bản CCoding có thể khác giữa hai cửa sổ** (Phòng Dev đang sửa; `run.mjs:169-176` không ghi hash): chờ SR-03; trước đó người vận hành ghi hash tay (§8). (d) B5 dùng `senior-swe` qua REST (`ccoding.mjs:30`): chênh B5 so với A0 gồm cả khung và hồ sơ vai, không tách riêng; chỉ hợp bài coding.

### 3.2 Giả thuyết mới: B-01 (làn đơn) và B-02 (cổng chất lượng)

#### B-01 — Làn đơn tương đương ±15 % so với A0-sonnet (thay P9 của bản 1)

- **Lý do.** Mục tiêu của giám đốc: việc nhỏ dùng agent đơn, tối ưu chi phí (`improvement-backlog.md` §3). Làn nhanh C7 đã chậm 1,44× và đắt 2,72× Sonnet đơn. **Chưa có dữ liệu, chưa thể chạy; chỉ chạy sau khi B-01 triển khai và hash ghi vào §8.**
- **Arm.** `SL` (làn đơn, sau B-01) so với `A0-sonnet`. `FL` (làn nhanh hiện có) chỉ là **đối chứng mô tả**, không là giả thuyết xác nhận: dữ liệu C7+C9 đã cho FL/A0-sonnet = token ×4,09 và thời gian ×2,20 (`run-plan.md` §4), nên dự báo FL không tương đương ±15 %. Việc dự báo này dựa trên dữ liệu đã thấy, nên không dùng làm xác nhận.
- **Bài.** Tập chính: **t1–t5** (danh sách cố định, không theo `size`; `size` của t1–t5 do Phòng Dev gán và chưa biết). Tập phụ (khám phá): các bài của bộ có `size ≤ 2` chạy được (c1, c2, l3, l4; thêm l1, l2 sau khi sửa `repo/`).
- **Biến đo chính (ba đại lượng, mỗi đại lượng một TOST riêng):**
  - **(a) token có trọng số** (`tokens.weighted`): R_a = TB(SL)/TB(A0-sonnet). **Độ nhạy: USD ước tính** theo bảng giá có phiên bản theo model (chờ SR-02; không đổi chỉ số chính nếu kết luận khác, báo cả hai).
  - **(b) thời gian thực** (`wallSec`): R_b. Polling 10 giây (`ccoding.mjs:38`) làm tỉ số của bài ngắn nhiễu.
  - **(c) điểm tương đối**: R_c = TB(score SL)/TB(score A0-sonnet).
- **Ngưỡng.** Mỗi đại lượng: R ∈ [0,85; 1,15]. Tỉ số tính bằng trung bình theo bài của log-tỉ số rồi lấy mũ (thang log, `suite-review.md` §4.2.3). **Cảnh báo (c):** nếu A0-sonnet ≈ 1,00 (như t1–t5), biên ±15 % của điểm rất rộng; báo kèm Δ tuyệt đối (pp). Điều kiện không kém hơn 2 pp của P9 chuyển sang B-02 (chất lượng).
- **Phép kiểm.** TOST: bootstrap **90 % CI** (theo bài, lấy lại lượt trong ô) nằm trong [0,85; 1,15]; α = 0,05 mỗi phía; hạt 20261102. Kết luận B-01 = hợp giao (IUT) của (a), (b), (c); không hiệu chỉnh thêm.
- **N.** `run-plan.md` §4: (a) 30/arm, **(b) 45/arm**, (c) 8–17/arm. Chọn **45/arm = 9 lượt mỗi bài × 5 bài** cho cả SL và A0-sonnet; A0-sonnet có thêm 36 lượt lịch sử C7+C9 chỉ làm độ nhạy.
- **Trước 5/11.** **B1: không đạt** (không có FL/SL, t1–t5). **B2: đạt (W4) cho FL; cho SL chỉ nếu arm có mặt trước W4.** Nếu SL chưa có thì dành 15,4 triệu cho H4 và H3 (`run-plan.md` §4); B-01 xác nhận chờ vòng sau 5/11.
- **Kết quả bác bỏ.** CI 90 % của bất kỳ R nào có cận dưới > 1,15 hoặc cận trên < 0,85.
- **Khóa.** Chờ SR-02 (USD), SR-03 (hash SL), SR-04 (hàm TOST), SR-01.

#### B-02 — Cổng chất lượng chặn ca "đỏ kéo dài và bỏ sót phần việc"

Định nghĩa dùng đúng `improvement-backlog.md` §4.1 bước 2 (đỏ → đỏ mà đề bài nêu tên lệnh hay mục tiêu làm xanh ⇒ bắt buộc vào vòng sửa, reviewer LLM không có quyền duyệt, `approved` ép `false` chừng nào lệnh còn đỏ) và B-10 (quy tắc A: đích tệp/module nêu trong đề hay tóm tắt kế hoạch mà không hạng mục nào nhận ⇒ chặn trước thực thi; quy tắc B: kế hoạch đọc dở ⇒ không chạy). Ca chuẩn: `results/C9/t5-logq.ccoding-fastlane.2` (95/146 test ẩn; kế hoạch 2/4 hạng mục bỏ `agg.js` và `bin/logq.js`; `npm test` exit 1; reviewer vẫn `approved: true`).

| Mã | Giả thuyết | Arm × bài | Phép kiểm và ngưỡng | N | Trước 5/11 |
|---|---|---|---|---|---|
| **B02-M** (cơ chế, xác định) | Cổng chặn đúng ca đã biết và không chặn nhầm | Phát lại offline trên mọi `results/C*/*/ccoding-task.json` (FL, bộ cũ); ca t5; đối chứng `t1-duration.ccoding-fastlane.3` | (1) `t5-logq.ccoding-fastlane.2` bị chặn bởi bước 2 **và** bởi cả quy tắc A và B của B-10; (2) `t1-duration.ccoding-fastlane.3` **không** bị chặn; (3) ≤ 1 lượt bị chặn ngoài t5, mỗi lượt có giải thích; (4) 0 lượt `approved` khi lệnh đề bài đòi xanh còn đỏ | xác định (toàn bộ `ccoding-task.json` hiện có; không tốn hạn mức LLM) | **Đạt nếu cổng đã merge** (cả hai nhánh) |
| **B02-G** (cổng trên bộ đo) | Với arm có cổng (B0 + cổng, `SL` + cổng), lượt `approved` khi lệnh đề bài đòi xanh còn đỏ = 0 | arm có cổng × c3, c4, c5 và t5 | đếm trên `ccoding-task.json`: `review.approved` và `projectChecks.latest[].ok` của lệnh có tên trong `brief`; ngưỡng = 0 | mọi lượt có điều kiện. Tần suất thật: ca "đỏ kéo dài" ≈ 1–2/40 lượt FL; quan sát ≥ 3 ca cần ≈ 120 lượt FL | **Không đạt thống kê**; báo số lượt có điều kiện và số vi phạm (mô tả), cận trên theo quy tắc ba nếu có 0 vi phạm |
| **B02-Q** (chất lượng, thống kê) | Test ẩn/điểm của arm có cổng không kém A0-sonnet, biên 2 pp | arm có cổng, A0-sonnet × t1–t5, c5 | không kém hơn một phía α = 0,05, biên 2 pp; Δ điểm theo bài, bootstrap | n ≈ 106/arm (σ = 0,059 từ 40 lượt FL; sd A0 = 0) | **Không đạt** (cả hai nhánh): chỉ mô tả; phương án lùi là B02-M |
| **B02-H8b** (bỏ yêu cầu) | Tỉ lệ lượt coding có một nhóm test ẩn hỏng toàn bộ (H8b, §3.1) của arm có cổng ≤ A0-sonnet | arm có cổng, A0-sonnet × c3, c4, c5, t5 | so hai tỉ lệ; "SUPPORTED theo chiều CCoding tệ hơn" là phản bác | ≈ 100+ mỗi arm | **Không đạt**; mô tả. Chỉ tính được khi tên test có trong dữ liệu (§3.1 H8) |

- **Khóa.** B02-M chờ cổng (B-02 §4.1, B-10) merge và hàm phát lại; B02-G, B02-Q chờ SR-01, SR-03, SR-13. B02-M không phụ thuộc hạn mức nên chạy trước mọi vòng LLM.
- **Giới hạn đã biết.** B-02 và B-10 dựa trên **1 ca** (t5 C9 lượt 2); nguyên nhân "plan hỏng một phần hay `parsePlan` cắt" chưa kiểm vì `calls.jsonl` ở server cloud, không có trong repo (`improvement-backlog.md` §6). Tần suất loại lỗi này chưa ước lượng được.

### 3.3 Bộ phụ: P1–P9 (giả thuyết bản 1, t1–t5 và `l1-modules`, `l2-chain`, t6–t8)

Đổi mã H_i → P_i (i = 1..9) theo thứ tự. Nội dung giữ như v1.0; **P_i không được dùng với nghĩa của H_i trong bộ đo của giám đốc**. Dữ liệu xác nhận là C9 (làn nhanh 6 lượt, Claude Code Sonnet 8 lượt mỗi bài t1–t5, chạy cùng lúc), `l1-modules`/`l2-chain`, t6–t8 (chưa có). C9 dừng giữa chừng do hạn mức (`context/c9-partial-2026-11-02.md`): số lượt thực có ghi vào §9 khi nạp. Phép kiểm chung: (i) p hoán vị phân tầng theo bài (hạt 20261102), (ii) CI bootstrap 95 % phân tầng (10 000 mẫu), (iii) Cliff's delta (báo, không dùng quyết định); lệnh gốc `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --rounds C9 --tasks <danh sách> --format md [--exclude-run …]`. Loại lượt: E1–E4 (§4.2).

| Mã | Giả thuyết (bản 1) | Ngưỡng | Phép kiểm | N (mỗi ô) và công suất | Kết quả bác bỏ |
|---|---|---|---|---|---|
| **P1** | Thời gian làn nhanh / Claude Code Sonnet trên t1–t5 (C9 only) | R > 1,3 (H0: R ≤ 1,3). Kỳ vọng trước từ C7+C8: R = 1,545, CI [1,452; 1,647]. Δwall = 25,7 s | Hoán vị phân tầng một phía trên wall_CC/1,3; CI bootstrap của R; **Holm bộ cũ** (xem dưới) | 6/8 (C9). Kịch bản σ cũ: công suất 3–11 %; kịch bản CV 25 %/8 %: 79–93 %. Công suất tính lại < 50 % sau C9 ⇒ báo "thiếu công suất" | CI 95 % của R có cận trên ≤ 1,3 |
| **P2** | Chi phí làn nhanh > Claude Code Sonnet | D > 0; "đáng kể" nếu cận dưới CI ≥ 0,1 USD | Hoán vị một phía; CI bootstrap | 6/8; chênh nhỏ nhất phát hiện ≈ 0,23–0,28 USD; Δ = 0,1 USD không có công suất (z = 1,24) | Cận trên CI của D ≤ 0 |
| **P3** | Tỉ lệ test ẩn đạt của làn nhanh không kém hơn, biên 2 điểm % | H0: Δ ≥ 0,02 (tỉ lệ test ẩn lỗi CC − Sonnet) | Kiểm định điểm một phía (Miettinen–Nurminen hoặc Newcombe; chưa kiểm nguồn thuật toán); khi 0 lỗi cả hai nhánh: P = (1 − 0,02)^N. **Đơn vị là test ẩn**, không phải lượt (cận trên tỉ lệ lượt lỗi ≈ 11,6 % với 30 lượt) | N test = 2 766 (6 × 461) và 3 688 (8 × 461) ≫ 265. Các test trong một lượt không độc lập (C7 t2: 8/60 lỗi từ hai quy tắc): kết quả theo test lạc quan, bắt buộc báo kèm số lỗi theo lượt | Cận dưới CI 95 % của Δ ≥ 0,02 |
| **P4** | Chi phí cố định của điều phối gần hằng số (phụ) | a > 30 s trong y = a + b·x (y = `wall_s` làn nhanh; x = TB Sonnet cùng bài cùng vòng) | CI bootstrap 95 % của a; không Holm | C9 + `l1-modules` + `l2-chain` (7 điểm x); không có công thức n riêng (ngoại suy về x = 0) | Cận trên CI của a ≤ 30 s; hoặc b ≈ 1 và a ≈ 0. Kết quả P4 là đầu vào §7 |
| **P5** | `l1-modules`: CCoding nhanh hơn Claude Code Sonnet | R < 1; cỡ quan tâm R ≤ 0,8 | Hoán vị một phía (H0: R ≥ 1); CI bootstrap | 12/12 (ngân sách); công thức 25–37 mỗi nhánh; công suất ≈ 27–50 % nếu hiệu ứng thật là 20 % ⇒ "Không kết luận" có thể do thiếu công suất | Cận dưới CI của R ≥ 1 |
| **P6** | `l2-chain`: CCoding không nhanh hơn và tốn hơn (hợp giao P6a, P6b) | P6a: R > 0,85; P6b: D > 0 | P6a hoán vị trên wall_Sonnet·0,85; P6b như P2; p = max | 12/12; P6a có công suất chỉ khi R thật ≥ 1,14–1,20 | CI của R có cận trên ≤ 0,85, hoặc CI của D có cận trên ≤ 0 |
| **P7** | Bài giữ lại t6–t8: hướng của P1 vẫn giữ | R > 1 (R > 1,3 chỉ mô tả) | Hoán vị phân tầng một phía; α = 0,025; **không Holm** | 6/6 mỗi bài (18 + 18); công suất ≈ 84 % nếu R thật 1,2. **Ràng buộc:** CCoding cùng hash với C9 (§8); không tinh chỉnh bằng t6–t8; mọi lần chạy trước khóa ghi §9; sửa đề chỉ trước lượt đo đầu tiên | CI của R có cận trên ≤ 1 |
| **P8** | Token ghi cache của CCoding ≥ 2× Claude Code (phụ) | R > 2 (H0: R ≤ 2) | Hoán vị trên cache_write_CC/2; CI; không Holm | 6/8; CV 30 % là giả định; công suất cao nếu R thật 2,8. Cảnh báo: so token, không so tiền | Cận trên CI của R ≤ 2 |
| **P9** | Làn đơn đạt chỉ tiêu ±15 % so với Claude Code Sonnet (chưa chạy) | R_t, R_c ∈ [0,85; 1,15]; Δ < 0,02 | TOST bootstrap 90 %; hợp giao 3 điều kiện | 8/8 mỗi bài t1–t5 | CI 90 % của R_t hoặc R_c ngoài biên |

**Holm bộ cũ.** Họ chính của bản 1 giữ nguyên: {P1, P2, P3, P5, P6}, K = 5, ngưỡng 0,025/(5 − i + 1); P6 là IUT. P7 kiểm riêng; P4, P8 phụ; P9 **chuyển sang B-01 ở dưới** (không còn chạy độc lập). Họ này **tách hẳn** với họ Holm của bộ đo giám đốc (§2.5): hai dữ liệu, hai grader, hai hệ đo token, không hiệu chỉnh chéo.

**Bảng ánh xạ P↔H** (một dòng mỗi giả thuyết bản 1; phân loại: **trùng** = cùng câu hỏi và cùng phép kiểm; **bổ sung** = cùng mục đích hay hướng nhưng khác arm/biến/ngưỡng nên kiểm tách riêng; **chỉ bộ cũ** = không có đối ứng trong H1–H10 và chỉ áp cho t1–t5 / `harness/`):

| P (bản 1) | Nội dung bản 1 | Đối ứng trong bộ đo giám đốc | Phân loại | Ghi chú |
|---|---|---|---|---|
| P1 (H1 cũ) | Thời gian làn nhanh/Claude Sonnet > 1,3 trên t1–t5 | H5 (thời gian B0/A0 ≥ 1,5×, `analyze.mjs:83`) | **Bổ sung** | H5 so B0 với A0-sonnet trên 13 bài, ngưỡng 1,5× ở ≥ 80 % bài; P1 so làn nhanh, ngưỡng 1,3× gộp theo bài. Cùng hướng, khác arm và bài |
| P2 (H2 cũ) | Chi phí (USD) làn nhanh > Claude Sonnet | H5 (phần token có trọng số ≥ 3×) và độ nhạy USD của B-01(a) | **Bổ sung** | H5 dùng token có trọng số chứ không phải USD; arm B có `costUsd = 0` (SR-02) nên P2 là hệ duy nhất đo USD cho tới khi SR-02 xong |
| P3 (H3 cũ) | Test ẩn không kém hơn, biên 2 điểm % | không có H tương ứng; ý nằm ở B02-Q | **Chỉ bộ cũ** (ý chuyển sang B02-Q cho bộ mới) | H3 giám đốc là recall/precision của review (không phải không kém hơn) |
| P4 (H4 cũ) | Hệ số chặn a > 30 s (chi phí cố định) | H10 (lợi thế tăng theo `size`) | **Bổ sung** | Cùng mục đích hiệu chỉnh ngưỡng nhỏ/lớn của B-01, khác biến giải thích (thời gian Sonnet so với `size` chưa định nghĩa). §7 vẫn dùng P4 |
| P5 (H5 cũ) | `l1-modules`: CCoding nhanh hơn | gần nhất H1 (việc phân rã được) | **Chỉ bộ cũ** | `l1-modules` không nằm trong 13 bài của bộ mới. Lưu ý: "l1" của bộ mới là `l1-oncall` (logic), khác bài |
| P6 (H6 cũ) | `l2-chain`: CCoding không nhanh hơn, tốn hơn | gần nhất H2 (logic ràng buộc chặt, B0 không tốt hơn) | **Chỉ bộ cũ** | `l2-chain` (4 tầng phụ thuộc) khác `l2-knights` (logic). Dev đang dựng `l2-chain`; khi vào bộ mới thì đăng ký lại bằng §9 |
| P7 (H7 cũ) | Bài giữ lại t6–t8, hướng P1 vẫn giữ | **không phải H7** của giám đốc (ổn định SD) | **Chỉ bộ cũ** | Hai "H7" khác nghĩa hoàn toàn; bản 2 chỉ dùng "P7" cho nghĩa cũ |
| P8 (H8 cũ) | `cache_write` CCoding ≥ 2× | H5 (token có trọng số gồm `1,25·cacheWrite`) | **Bổ sung** | `cacheWrite` có trong `tokens` của `runs.jsonl`, nên P8 tính được trên bộ mới như phụ; H8 của giám đốc là thất bại điều phối, **không** liên quan |
| P9 (H9 cũ) | Làn đơn B-01 ±15 % | **B-01 mới** (§3.2) | **Trùng ý, đổi đo** | Đổi so với P9: đối chứng A0-sonnet cùng bộ đo; chỉ số chính token có trọng số (USD là độ nhạy); thêm thời gian; điểm tương đối; biên không kém 2 pp chuyển sang B02-Q |

## 4. Dữ liệu loại, kiểm soát lượt và quy tắc dừng

### 4.1 Nguyên tắc loại (giữ từ bản 1)

- Chỉ loại theo **nguyên nhân kỹ thuật ngoài hệ đang đo**, quyết định bởi người chưa xem `score`, `wallSec`, `tokens` của lượt đó (chỉ xem `status`, `error`, nhật ký). Áp đối xứng cho mọi arm.
- Lỗi do sản phẩm (CCoding hay Claude Code) là **kết quả**, không loại.
- Lượt bị loại **không bị xóa**: ghi vào "sổ lượt bị loại" (khóa `task__arm__rN`, mã, bằng chứng) và loại khỏi **bản sao** `runs.jsonl` dùng cho `analyze.mjs` (§2.3). Thêm lượt thay thế với `rep` mới, tối đa 2 lượt thay mỗi ô; quá mức đó ô bị đánh dấu "thiếu dữ liệu".
- Mọi giả thuyết chính còn có phân tích **không loại** (độ nhạy, §5).

### 4.2 Bộ phụ P1–P9 (harness cũ, `runs.csv`) — giữ nguyên từ bản 1

Khóa lượt trong `--exclude-run`: `<vòng>/<bài>/<hệ>/<lượt>` hoặc `task_id`.

| Mã | Loại | Cách phát hiện | Loại? |
|---|---|---|---|
| **E1** | Treo do hạ tầng | `run.status` ∈ {`failed`, `error`} kèm lỗi mạng/máy chủ trong `run.error` hoặc log CLI; hoặc watchdog giết; hoặc `events.jsonl` không có sự kiện > 300 s mà không có lệnh công cụ đang chạy. Nghi ngờ khi `wallSecHarness − wallSec` > 60 s (ngưỡng chưa kiểm) | Có |
| **E2** | Timeout của harness | CCoding vượt `cfg.ccodingTimeoutMin` (60 phút, `harness/run.mjs:160`); chấm test ẩn hết giờ `grade.hidden.timedOut` (20 phút, `harness/run.mjs:209`) | Hạ tầng → loại; hệ không xong → **giữ**, tính thất bại (N2) |
| **E3** | Đăng nhập/hạn mức | log chứa thông báo giới hạn dùng/tốc độ/quota; `run.status = error`; `cost_usd` = 0 hoặc thiếu | Có; dừng cả hai nhánh |
| **E4** | Lỗi harness | không clone được repo; `grade` thiếu; `hidden.total` = 0 hoặc khác số test; `rep` trùng; bản CCoding ≠ hash đăng ký; `audit` khác rỗng (không tự loại, đưa tay cho người quyết) | Có (trừ `audit`) |
| **N1–N3** | Lỗi sản phẩm; test ẩn rơi/hết giờ chấm; chi phí/thời gian cực đoan | — | Không loại |

### 4.3 Bộ đo giám đốc (H1–H10, B-01, B-02): ba tiêu chí loại mới

Mã **Q** (hạn mức, tương ứng E3), **L** (rò rỉ, tương ứng `audit`/E4 nhưng có cờ riêng), **T** (timeout, tương ứng E2). E1 (treo hạ tầng) và E4 (lỗi harness, gồm `status = 'error'` kèm ENOENT thiếu `repo/`, `run.mjs:72`) áp nguyên. Lượt Q, T(hạ tầng), E1, E4 bị loại **đối xứng giữa các arm**; lượt L bị loại theo cờ.

| Mã | Tiêu chí | Cách nhận diện qua `runs.jsonl` (đọc từ `run.mjs`, `lib/claude.mjs`, `lib/ccoding.mjs`) | Loại? | Xử lý |
|---|---|---|---|---|
| **Q** | Lượt bị cắt do hạn mức 5 giờ (429, hết hạn mức, đăng nhập) | **Hiện tại (gián tiếp):** `status` ∈ {`failed`, `error`} (`claude.mjs:50`; `run.mjs:171`) **và** (`tokens.weighted` ≈ 0 hoặc `wallSec` ngắn bất thường so với trung vị ô) **và** văn bản báo giới hạn trong `error` hoặc `artifacts/<key>/_FINAL.txt` (với arm A, `finalText = result.result`; `run.mjs:167`) hoặc trong `calls.jsonl`/nhật ký server của nhiệm vụ (`taskId` của arm B). Dòng kết quả **không lưu** stderr hay `attention` (`claude.mjs:53`; `ccoding.mjs:71`), nên phải mở `artifacts/`. **Sau SR-01/SR-19:** trường nguyên nhân `quota` và `quotaState` mỗi dòng | **Có** | Quarantine rồi chạy lại cùng khóa theo `run-plan.md` §3.0, §5.0; **không** để lượt `failed` nằm lại vì `run.mjs:64` coi mọi khóa đã ghi là xong. Khi chạm hạn mức giữa lô: dừng cả hai arm, chờ khôi phục, chạy tiếp lịch (như E3) |
| **L** | Rò rỉ `leak` (agent chạm bộ đo: hidden, `checklist.json`, `issues.json`, đường dẫn suite) | `leak === true` (`run.mjs:87-91` cho arm A, `:114`, `:121`; `:141-144` cho arm B, tìm trong `calls.jsonl`). `analyze.mjs:11-12` đã loại `leak` khỏi `R`. Best-of-N (A2) đặt `leak` nếu bất kỳ ứng viên nào rò (`:135`) nhưng bước chọn không kiểm | **Có** (đã mặc định trong `analyze.mjs`) | Bắt buộc **kiểm tay** từng lượt `leak` trước khi loại: từ khóa có thể xuất hiện hợp lệ trong prompt hệ thống của arm B (dương tính giả, SR-21). Dương tính giả ⇒ khôi phục lượt, ghi §9. Rò thật ⇒ loại và thay lượt (tối đa 2 mỗi ô). Báo số lượt `leak` theo arm: nếu lệch giữa arm thì ghi khả năng thiên lệch |
| **T** | Timeout | `status = 'failed'` **và** `wallSec ≥ 0,98 × cfg.timeoutMin × 60` với `cfg.timeoutMin` đọc từ `config.json` (`run.mjs:62`, mặc định 60, kế hoạch dùng `--timeout 20`). Arm A: `child.kill('SIGTERM')` sau `timeoutMin` (`claude.mjs:31`) nên không có cờ `timedOut` trong dòng; arm B: `timedOut: true` chỉ đặt trong biến cục bộ (`ccoding.mjs:36`), không vào dòng kết quả. Phải dùng `wallSec` để nhận diện | **Hai trường hợp (như E2):** timeout **do hạ tầng** (cùng chứng cứ E1) → loại; timeout **do hệ không xong** (không có lỗi hạ tầng) → **giữ**, điểm theo grader (thường 0), `wallSec` bằng giới hạn (kiểm duyệt phải) | `--timeout 20` là hạn chót đăng ký, **không đổi sau khi thấy dữ liệu**. Vì đặt 20 phút thấp hơn mặc định 60, báo số lượt T theo arm (arm B nhiều lượt gọi dễ chạm hơn: `suite-review.md` §3) |

Ngoài ba tiêu chí này: lượt `status = 'error'` kèm ENOENT (thiếu `repo/`, 4 bài `a1, l1, l2, r1`) là E4: loại và bài bị bỏ khỏi `--tasks` cho tới khi Phòng Dev sửa; `run.mjs` thoát 0 dù có lỗi nên kiểm `status` sau mỗi cửa sổ.

**Điều chưa làm được trong dữ liệu hiện có (ghi rõ).** `analyze.mjs:11-12` chỉ loại `leak`; lượt `failed` do Q hoặc T hạ tầng vẫn bị tính điểm 0 nếu không lọc. Đến khi SR-01 xong, người vận hành lọc bằng bản sao `runs.jsonl` và ghi lần lọc vào sổ lượt bị loại. Nếu SR-01 làm khác (ví dụ trường `excluded`), ghi v2.1.

### 4.4 Quy tắc dừng

- **(a) Dừng ở n đã định** theo §3.1 (và bảng B-01/B-02): H1 r = 3 (c3–c5), H3 r = 10, H4 r = 11, H5 r = 3, H6 A1 r = 3 và A2 r = 2, H7 r = 5, B-01 9 mỗi bài. **Không xem p, CI, hay chênh lệch** của giả thuyết xác nhận trước khi dữ liệu đủ. Xem thống kê mô tả không phải chênh lệch giữa arm (phục vụ §4.3) thì được; điều chỉnh tăng `--repeats` giữ khóa cũ (`run-plan.md` §3.0) chỉ khi đã đăng ký ở đây.
- **(b) Không dừng sớm vì kết quả**, không tăng n để đuổi p. "Không kết luận" được báo như vậy; mở rộng chỉ qua nghiên cứu mới có đăng ký mới.
- **(c) Dừng vì an toàn/hạ tầng:** hết hạn mức (Q) hoặc ≥ 25 % lượt của một ô bị E1/E4 thì dừng lô; một lượt làn nhanh có ≥ 10 % test ẩn lỗi thì ghi tín hiệu và tiếp tục.
- **(d) Ngân sách:** mỗi cửa sổ xếp tối đa 22 triệu token có trọng số và 3,6 giờ wall-sum (`run-plan.md` §2); hết ngân sách thì dừng, báo n thực tế, ô thiếu dữ liệu bị đánh dấu, **không điều chỉnh phép kiểm**. Thứ tự cắt khi chi phí thật vượt mô hình > 20 %: B3 → A0-opus → B0 × t1–t5 → A2 r2 → A1 r3 (`run-plan.md` §3.2).
- **(e) Chuyển nhánh:** chuyển từ Nhánh 1 sang Nhánh 2 chỉ ở ranh giới cửa sổ, cùng `--out`; không đổi thứ tự `--arms`, `--seed` hay số lượt giữa chừng (lịch xen kẽ phụ thuộc chúng, `run.mjs:42-52`).

## 5. Phân tích chính và phân tích khám phá

**Phân tích chính (xác nhận):** họ Holm {H1, H2, H3, H6} (K = 4, §2.5); H7 (riêng, Nhánh 1); B-01 (họ riêng IUT); B02-M (xác định).
**Phụ, báo kèm CI:** H4, H5 (mô tả có ngưỡng); P1–P9 (họ riêng, §3.3).
**Mô tả/thăm dò (không ra quyết định):** H8, H9, H10; B02-G, B02-Q, B02-H8b.
Thứ tự báo cáo: Holm → H7 → H5/H4 → B-01 → B-02 → H8–H10 → P1–P9.

**Phân tích khám phá** (gắn nhãn "khám phá"): (1) kết quả theo từng bài và theo loại bài; (2) độ nhạy: không loại lượt nào; chỉ loại Q; loại lượt cực trị; (3) so với A0-opus, B1–B5, B3 (nếu có); (4) USD ước tính sau SR-02; (5) `byPhase` của arm B (phân rã chi phí theo pha), tỉ lệ vòng sửa; (6) giám khảo cặp (`pairwise.mjs`) cho design, requirements, research: **chỉ báo cáo kèm giới hạn mù** (§6); (7) xu hướng theo thứ tự chạy, `window` đánh số; (8) gộp với harness cũ chỉ cho mô tả và độ nhạy (`run-plan.md` §6.2); (9) H10 điều chỉnh loại bài; (10) mọi con số cho `token-analysis.md` dẫn từ `token-analysis.mjs`.

## 6. Đe dọa tính hợp lệ

| Loại | Đe dọa | Biện pháp/ghi nhận |
|---|---|---|
| Nội tại | **Lượt hỏng không chạy lại, tính điểm 0** (`run.mjs:64`; `analyze.mjs:11-12`). Arm B (nhiều lượt gọi) hay arm chạy cuối cửa sổ bị phạt giả | §4.3 (Q, T); SR-01; quarantine trước mỗi lần chạy lại và phân tích |
| Nội tại | **Thứ tự**: xen kẽ + xoay, không phải khối ngẫu nhiên hoàn toàn; arm đứng đầu 7/6 với k = 2 (`run.mjs:47-53`) | Ghi thứ tự thực từ `at`; SR-23 (P2). Báo là "xen kẽ + xoay" |
| Nội tại | **Các arm chạy ở cửa sổ khác nhau**: A0-sonnet r1–r3 chỉ ở W1 (`run-plan.md` R5) | A0-sonnet chạy xen kẽ r4–r5 cùng B0; so A0-sonnet W1 với t1–t5 của C9 để kiểm trôi theo thời gian |
| Nội tại | **Hạn mức đổi trạng thái giữa chừng** (README:65 cấm trộn nhưng không có cơ chế) | Cờ `window` và `quotaState` (SR-19, SR-03); trước đó ghi tay mỗi cửa sổ |
| Nội tại | **Phiên bản CCoding khác nhau giữa các arm và giữa các cửa sổ** (Phòng Dev đang gộp `main`; `run.mjs:169-176` không ghi hash) | Chờ SR-03. Trước đó: `git rev-parse HEAD` và `git status --short` trước mỗi cửa sổ, ghi vào §8; không `git pull` hay đổi nhánh giữa cửa sổ; nếu phải đổi thì `--out` mới (`run-plan.md` §6.4). `analyze.mjs` cảnh báo khi một arm có hơn một hash |
| Nội tại | **Cùng runtime** `claude-cli` (`run.mjs:33`): công bằng về model nhưng B0 có lập lịch pha riêng, model từng pha không ghi vào dòng; B5 qua REST + `senior-swe` | Ghi cấu hình thực của B0 và B5 mỗi lô; giải thích chênh B5 so A0 gồm cả khung và hồ sơ vai |
| Nội tại | **Máy dùng chung / hạn mức dùng chung** với cloud và CCoding của giám đốc (`run-plan.md` R1) | Giám đốc xác nhận không dùng CCoding trong cửa sổ chạy; ghi M thực dùng sau mỗi cửa sổ; một luồng tuần tự để `wallSec` dùng được |
| Cấu trúc | **`weighted` khác USD**; `5 × output` đúng trong một model; `0,1 × cacheRead` làm phiên dài rẻ giả; hai hệ đo token khác nhau (A: `result.usage`; B: tổng `calls.jsonl`); `costUsd` của B = 0 | Chỉ số chính `weighted` (khớp giám đốc); báo token thô và `cacheRead/total`; USD chỉ độ nhạy sau SR-02 (§2.1); không suy tương đương USD |
| Cấu trúc | **`size` không định nghĩa**, gán không nhất quán, lẫn loại bài; nhãn `hypotheses` trong `task.json` không khớp bộ lọc `analyze.mjs` | H10 thăm dò; H1 cố định danh sách bài; đăng ký theo mã H, không theo nhãn (SR-05, SR-15) |
| Cấu trúc | **Grader regex bắt chữ** (a1, r1: `sign` khớp "design"; `daily-volume` bỏ sót "1,4 TB"); `eq` so khóa theo thứ tự (`l1`); `s1` không phân biệt mồi nhử với FP khác; `citationPrecision` không kiểm đúng bài; null ≠ 0 ở c3 (0,17) và c5 (0,22) | Chạy toàn nghiên cứu `--judge` và khóa một chế độ chấm (SR-07); SR-09/16/17/18 (P1); Δ giữa hai arm triệt tiêu sàn null nhưng H10 thì không |
| Cấu trúc | **Giám khảo LLM chấm sản phẩm LLM** (`pairwise.mjs`, `lib/judge.mjs`): mù một phần (`blind()` `judge.mjs:6-12`; sản phẩm B thường tiếng Việt, có `REVIEW.md`/`NOTES.md`); giám khảo mặc định `opus` trùng model A0-opus (`pairwise.mjs:14`); không giám khảo ngoài họ Claude, không đối chiếu người; không CI/kiểm định dấu; cắt ở 60 000 ký tự | Chỉ báo pairwise kèm giới hạn; không dùng pairwise để ra quyết định cho họ Holm; SR-08 (≥ 20 % cặp do người chấm, giám khảo thứ hai, CI nhị thức). Tài liệu về thiên lệch tự ưu ái chưa kiểm nguồn trong gói này: coi là rủi ro cần kiểm |
| Ngoại tại | 13 bài tổng hợp, JS/Node, tác nhân Claude; 6 loại nhưng H3, H4, H9 chỉ 1 bài; t1–t5 đã dùng để tinh chỉnh CCoding (C1–C8) nên lạc quan | Kết luận H3/H4/H9 chỉ về s1/a1/re1; P-bộ phụ có P7 (t6–t8) làm bài giữ lại; không khái quát sang Opus hay việc lớn |
| Kết luận thống kê | 3 lượt/ô; 4 bài cho H1/H2 (p ≥ 0,125); TOST thiếu công suất ở H6; σ bộ mới đều là giả định; trần điểm (A0-sonnet 1,000 ở t1–t5); `.some()` ở H6; xáo trộn H10 không đều; lỗi lệch chỉ số H5 (`:81-83`) | "Không kết luận" ≠ "không có hiệu ứng"; báo cỡ hiệu ứng và CI; sửa SR-06 trước khi chạy H5 |
| Kết luận thống kê | Chọn ngưỡng sau khi biết bộ bài (`size ≥ 3`, biên 5 pp) | Ngưỡng và danh sách bài của H1–H10 đóng băng ở §3.1 khi khóa |
| Rò rỉ | Tác giả đã thấy C1–C9 một phần (C9 ca t5) và `selftest` | Ca t5 chỉ dùng để thiết kế B02-M, không dùng làm xác nhận nào khác; §8 |
| Rò rỉ | `leak` có thể dương tính giả hoặc bỏ lọt (A2 không kiểm ở bước chọn) | §4.3 L; SR-21 (P2) |

## 7. Hiệu chỉnh ngưỡng nhỏ/lớn của B-01 (giữ từ bản 1, đổi mã)

**Vai trò của P4.** Kết quả P4 (a, b) là đầu vào hiệu chỉnh ngưỡng làn đơn/đa tác tử của B-01. Hệ số chặn a và độ dốc b chỉ được **định cỡ** trên C1–C8 (mô tả) và **xác nhận** trên C9 cùng `l1-modules`, `l2-chain`. **H10 của giám đốc không được dùng để hiệu chỉnh ngưỡng** cho tới khi SR-05 xong (§3.1).

**Công thức chọn làn** (thống nhất với `improvement-backlog.md` §3.1): làn đơn khi **T̂_đơn < k × a**. Với T_CC = a + b·T_đơn, T* = a/(1 − b), nên k* = **1/(1 − b)**. Quy tắc cập nhật:
- Chỉ cập nhật k khi **CI 95 % của b nằm hoàn toàn dưới 1** và P4 được xác nhận (a > 30 s); khi đó k_mới = 1/(1 − b̂_trên), dùng cận trên (ưu tiên làn đơn khi chưa chắc).
- CI của b chạm 1 (hoặc ≥ 1): không nâng k; ghi "chưa hiệu chỉnh".
- P4 bị bác bỏ (a ≤ 30 s): k giảm theo độ nhỏ của a.
- Ngưỡng `parts`/`filesTouched` còn được kiểm bằng P5 (bài độc lập) và P6 (bài chuỗi) như hai điểm đầu mút; nếu P5 và P6 cùng "Không kết luận" thì k giữ nguyên.
- Giá trị ban đầu: `a₀ = 87,1 s`, `b₀ = 0,428`, `k₀ ≈ 1,75` (hồi quy thô C7, `improvement-backlog.md` §3.1): thăm dò, không xác nhận.

## 8. Khóa đăng ký (có điều kiện)

| Mục | Giá trị |
|---|---|
| Phiên bản | v2.0 (v1.0 đã commit trước đó, nhiệm vụ T-20261102-134405-b2c) |
| Soạn trên | nhánh `ccoding/t-20261102-175854-65c--s4`, sau commit HEAD `efa97a6` (gộp S2 — R7) |
| Thời điểm khóa | = thời điểm commit gộp của hạng mục S4 vào nhánh nhiệm vụ **và** các điều kiện bên dưới đều thỏa. Điền: ______ (kiểm bằng `git log --format='%H %aI' -- docs/research/preregistration.md`) |
| Hash commit khóa | điền khi gộp: ______ |
| **Hash commit merge Phòng Dev** (bộ đo sau sửa tự kiểm, gộp `main`, `task.json` t1–t5, arm làn nhanh, cờ hạn mức, `l2-chain`) | **chưa có: ______.** Chỉ khóa hẳn khi hash này có và các SR P0 bên dưới đã đóng |
| Điều kiện SR P0 | SR-01 … SR-08 (`suite-review.md` §5): trạng thái từng SR ở §9 |
| Hash CCoding của từng cửa sổ chạy | W1: ______ · W2: ______ · W3: ______ · W4: ______ · W5: ______ (ghi tay bằng `git rev-parse HEAD`; `run.mjs` chưa ghi) |
| Hash bộ đo | commit `1568774` (bộ của giám đốc) + hash `analyze.mjs`, `pairwise.mjs`, `lib/grade.mjs` thực dùng: ______ |
| Phiên bản `claude` CLI, model giám khảo | ______ ; giám khảo mặc định `opus` (`pairwise.mjs:14`) |
| Hash CCoding bộ phụ | C1: `14e2ec6` · C3: sau `d767806`, `e9147d8` · C4: sau `aa6aa3a` · C5: sau `9589c2f` và `0e82b82` · C6: `d7600f6` · C8: `c55a249` · C2, C7: chưa xác định chắc. C9 (cam kết): `c55a249` hoặc con cháu không đổi `src/`; hash thực dùng: ______ |
| Công cụ phân tích | `analyze.mjs` ở hash trên (hạt 20261102 cho bootstrap/hoán vị do phép kiểm mới; `analyze.mjs` có hạt riêng); script TOST ngoài (nếu dùng phương án lùi §2.3): hash ______ ; `prereg-tests.mjs` (bộ cũ, chưa có): ______ |
| Cam kết chưa xem dữ liệu bộ mới | `bench/vs-claude/results/` khi soạn: **không có `pilot*` và không có lượt nào của bộ mới** ngoài `selftest/` (n = 1 lượt, oracle/null). Tác giả **chưa xem kết quả A0/B của 13 bài**. Tác giả đã xem C1–C9 một phần, `selftest`, và `context/c9-partial-2026-11-02.md` (ca t5) |
| Nếu có người xem kết quả bộ mới trước khóa | ghi vào §9 (hiện không có) |
| Lệnh sẽ chạy | `run-plan.md` §5 (W1–W5), §5.3 (phân tích); `analyze.mjs` và `pairwise.mjs` theo §3.1 |

## 9. Sai lệch so với đăng ký

(Mọi sửa đổi sau thời điểm khóa, mọi lần dùng phương án lùi (§2.3), mọi lượt t6–t8 chạy trước khóa, mọi thay đổi hash, ngân sách hay n phải ghi vào đây trước khi xem kết quả liên quan.)

**Sai lệch của đề bài so với bản 1 (ghi nhận ở v2.0):** brief viết "8 giả thuyết bản 1"; thực tế bản 1 có **9 giả thuyết** (H1–H8 theo đề bài và H9 thêm cho B-01). Bản 2 đổi mã **cả chín** thành P1–P9 và P9 ánh xạ sang B-01 mới (§3.3).

**SR P0 đang chờ Phòng Dev và ảnh hưởng đến khóa** (từ `suite-review.md` §5; trạng thái: "chờ" cho tới khi có hash merge đóng nó):

| SR | Nội dung | H / giả thuyết bị ảnh hưởng | Trạng thái | Nếu không xong |
|---|---|---|---|---|
| SR-01 | `done` chỉ gồm `status === 'done'`; trường `excluded`; `analyze.mjs` loại Q/T/L theo §4.3 | Tất cả H1–H10, B-01, B-02 | chờ | Phương án lùi: bản sao `runs.jsonl` đã lọc (§2.3, §4.3); ghi §9 |
| SR-02 | Cộng `costUsd` cho nhánh `calls.jsonl`; lưu `model` mỗi cuộc gọi | Độ nhạy USD của B-01(a) | chờ | Bỏ độ nhạy USD của B-01 trong lần chạy này; kết luận chỉ về token có trọng số |
| SR-03 | Ghi hash CCoding, phiên bản `claude` CLI, model thực, `window`, `quotaState` mỗi dòng | Mọi H | chờ | Ghi hash tay mỗi cửa sổ (§8); một hash mỗi arm; nếu đổi hash thì `--out` mới |
| SR-04 | Hàm TOST dùng chung (bootstrap 90 % trên log-tỉ số) | H2, H6, B-01 | chờ | Script TOST ngoài (§2.3); nếu không có: H2, H6 chỉ báo ước lượng và CI, không phán |
| SR-05 | Định nghĩa `size`, `sizeBasis`; H10 điều chỉnh loại bài, CI độ dốc, Fisher-Yates | H10, H1 | chờ | H10 thăm dò (đã đăng ký vậy); H1 theo danh sách bài cố định |
| SR-06 | Sửa lỗi lệch chỉ số `analyze.mjs:81-83` | H5 | chờ | Tính H5 bằng script ngoài hoặc kiểm tay không có bài NaN |
| SR-07 | Khóa một chế độ chấm; chạy chính luôn `--judge` | H1 (r1), H4, H9 | chờ | Chạy `--judge` cho mọi arm a1, r1, re1; ghi §9 nếu lẫn chế độ |
| SR-08 | Giám khảo cặp: đối chiếu người, giám khảo thứ hai, CI nhị thức | Mọi kết luận dùng pairwise; H4, H9 | chờ | Không dùng pairwise để quyết định; báo giới hạn mù |

Các SR P1 ảnh hưởng phép kiểm (SR-10 cho H3, SR-12 cho H6, SR-13 cho H8, SR-14 cho H7, SR-18 cho H9) **không chặn khóa**; nếu được làm trước khi chạy thì ghi **v2.1** (CHANGELOG) với phép kiểm mới và giữ phép kiểm cũ như độ nhạy.

| STT | Ngày | Giả thuyết/mục | Nội dung đã đăng ký | Thực tế | Lý do | Xem kết quả trước khi sửa? | Ảnh hưởng đến diễn giải |
|---|---|---|---|---|---|---|---|
| 1 | 2/11/2026 | Tổng quát (mã P) | brief: 8 giả thuyết bản 1 | 9 giả thuyết, đổi mã P1–P9 | Đối chiếu bản 1.0 | Không | Không |
| | | | | | | | |

## 10. Đạo đức & dữ liệu

- **Người tham gia:** không có. Không áp dụng đồng ý có hiểu biết.
- **Dữ liệu:** bài benchtest tổng hợp trong `bench/vs-claude/tasks`, nhật ký chạy và chi phí. **Phân loại: Nội bộ** (không có DLCN). Không dùng dữ liệu thật của khách hàng hay cơ quan. `artifacts/` có thể chứa đầu ra của agent: lưu trong `results/`, không ghi ra ngoài `data/` ngoài đường dẫn đã có.
- **Data Protection Gate:** không thay đổi thiết kế dữ liệu hay luồng dữ liệu; mọi lượt gọi LLM của CCoding vẫn qua `Orchestrator.call()`, log qua `LogStore`. Pairwise và `--judge` gửi sản phẩm của bài tổng hợp tới `claude -p` (không có DLCN). Đường dẫn máy cloud trong tạo phẩm C9 (`/home/claude/…`) không được chép vào tệp này. Tệp này không chứa bí mật, khóa hay token. Đánh giá `docs/data-protection-assessment.md` không đổi vì gói chỉ thêm tài liệu nghiên cứu (cần chủ dự án xác nhận nếu thấy khác).
- **Lưu giữ:** `results/` giữ nguyên; lượt bị loại ở §4 không xóa.

## Lịch sử bản

- **v2.0 (2/11/2026, S4/R6):** hệ chính đổi sang H1–H10 của bộ đo giám đốc; H1–H9 bản 1 đổi mã P1–P9, bảng ánh xạ P↔H; thêm B-01 (TOST ba đại lượng) và B-02 (B02-M/G/Q/H8b); §4.3 tiêu chí Q/L/T cho bộ mới; §6 đe dọa từ `suite-review.md`; §8 chỗ cho hash commit merge; §9 các SR P0 chờ. Chi tiết: `CHANGELOG.md`.
- **v1.0 (2/11/2026, S2/T-20261102-134405-b2c):** 9 giả thuyết (H1–H9 cũ) cho C9 và bộ t1–t5.

## Lệnh kiểm chứng cần chạy (tôi không có quyền chạy lệnh)

Tôi chỉ đọc và ghi tệp. Các số "N" và trạng thái "Đạt/Không đạt" lấy từ `run-plan.md` §4; dòng `analyze.mjs` lấy từ `suite-review.md` §3. Cần kiểm trước khi khóa:

```
grep -n "" bench/vs-claude/analyze.mjs | sed -n '60,115p'     # đối chiếu dòng H1-H10 ở §3.1
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks c1,c2,c3,c4,c5,l3,l4,s1,re1 --repeats 3 --timeout 20 --dry-run --out <tmp>
node --test bench/vs-claude/harness/stats.test.mjs
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md   # baseline exit 1 (thiếu vòng C9)
```
