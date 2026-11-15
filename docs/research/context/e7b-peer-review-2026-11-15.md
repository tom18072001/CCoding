# Phản biện K4 của E7b (BRIEF-27, 15/11/2026): nguyên văn

Phân loại dữ liệu: **Nội bộ**.

**Kết luận:** Sửa nhỏ

- **Nguồn:** sản phẩm hạng mục S5 (`@peer-reviewer`) của nhiệm vụ BRIEF-27 (T-20261115-172258-bab) trên văn phòng, tệp `outputs/research-S5-peer-reviewer.md` trong thư mục chạy của nhiệm vụ.
- **Người chép:** người điều phối, 15/11/2026, sau BRIEF-27b (vai biên tập không đọc được thư mục chạy của nhiệm vụ khác).
- Phần dưới đường kẻ là **nguyên văn từng byte** của tệp nguồn; chỉ thêm phần đầu này. Dòng kết luận ở trên chép lại kết luận của K4 theo đúng mẫu mà lint `review-verdict` đọc.
- Số dòng K4 dẫn (vd. `paper.md:924`) là số dòng tại HEAD `a70b1709`, trước khi BRIEF-27b sửa.

---

<!-- T-20261115-172258-bab · S5 · peer-reviewer (Peer Reviewer (Devil's Advocate)) · claude-cli/claude-opus-5-5 · in 54 / out 27841 · 31 công cụ -->

## Tóm tắt
**Kết luận: Sửa nhỏ.** Không có blocker hay major. Mọi số E7b trong `paper.md` §6.7 và `model-per-role.md` khớp `report.md`, `report.json` và `facts.json`. Nhánh F được đọc đúng thứ tự D → E → A → B → C → F và đứng được ở cả năm cách tính. Bài không có câu cấm QH36, và §9 chỉ được thêm, không sửa chữ cũ (diff có 0 dòng xóa). Lỗi đáng sửa nhất là `paper.md:924` ghi "Hai lượt E7 từng bị phân loại lại (lỗi 403)", trong khi §9 ghi 16 lượt. Ngoài ra mức bằng chứng của vai CTO ghi "vừa" ở bài nhưng "Thấp" ở `model-per-role.md`, và "Thấp" không có trong thang của tệp đó.

Tôi chưa ghi được tệp bàn giao vì vai này chỉ đọc, không có công cụ ghi tệp. Nội dung đầy đủ nằm ở cuối, cần người có quyền ghi chép vào đúng đường dẫn.

## Kết luận
Sửa nhỏ

## Phát hiện
Có 8 phát hiện mức minor, chi tiết và đề xuất nằm trong tệp bên dưới. Năm điểm chính:
- **`paper.md:924`:** bài ghi "Hai lượt" nhưng §9 ghi 16 lượt (`preregistration.md:1169`, R1 8, R2 8).
- **Mức bằng chứng không thống nhất:** `paper.md:774` ghi "vừa", `model-per-role.md:21` ghi "Thấp", mà thang ở `model-per-role.md:9` chỉ có Vừa / Yếu / Không có.
- **`paper.md:955`:** câu "chênh lệch chính nằm ở chặn nhầm" đọc như khẳng định có khác biệt, trong khi nhãn P2 là "chưa kết luận".
- **Đề xuất "tăng số mục" (`paper.md:956`, `model-per-role.md:76`):** 6 trong 10 cặp chỉ R1b chặn nằm ở `t5-logq`. Bootstrap lấy mẫu theo bài, nên CI rộng chủ yếu do khác biệt giữa các bài. Thêm mục trong 8 bài cũ khó làm CI hẹp lại; nên ưu tiên tăng số bài.
- **Câu hỏi (a)(i), (ii) của §9:** bài chưa trả lời trực tiếp (`paper.md:952–957`).

## Kiểm trích dẫn & số liệu
- **Số đã đối chiếu:** recall, chặn nhầm, CI Clopper–Pearson, unread, capped, USD, p thô, p Holm và CI bootstrap. Bài, `facts.json` (`:776–825`) và `report.json` (ví dụ chặn nhầm R1b, CP 0,1128–0,3223, CI bootstrap [−0,3478; 0,0286]) đều khớp `report.md`.
- **Tôi tự tính lại:** p McNemar P2 = 24/2048 = 0,0117, Holm = 0,0234. Cận dưới CP của 4/64 ước tính ≈ 1,7 % (xấp xỉ Poisson). Cả hai khớp báo cáo.
- **Kiểm bằng git:**
  - bản ghim `5911bf0c` có thật và chứa `7beb50c1` (D23);
  - từ bản ghim tới nay, `e7b-analyze.mjs` và `src/` không đổi, còn `results/e7b-cto/` chỉ có dòng thêm;
  - `preregistration.md` không có dòng nào bị xóa; `lock.json` chỉ thêm khối mới.
- **Chưa kiểm được:** sha256 của `report.md`/`report.json` (lệnh `sha256sum` bị chặn) và tính lại CP bằng scipy.
- **Trích dẫn ngoài:** không áp dụng, vì §6.7 không dẫn nguồn ngoài.

## Câu hỏi bảo vệ thử
Có 5 câu, kèm gợi ý trả lời, trong tệp bên dưới:
1. Vì sao p Holm = 0,0234 mà vẫn không đề xuất đổi model?
2. Vì sao lượt `unread` không làm lệch kết quả?
3. Vì sao không thể nói "Opus giảm chặn nhầm"?
4. Số E7b có phải là xác nhận E7 không?
5. Vì sao giữ Sonnet cho vai CTO?

**Lệnh đã chạy (chỉ đọc):** `git diff`/`--stat` (mốc 596c389 và 5911bf0c), `git cat-file -t 5911bf0c…` → `commit`, `git merge-base --is-ancestor 7beb50c1 5911bf0c` → exit 0, `git log 5911bf0c | grep D24`.

**Chưa chạy:** `npm run lint` và `npm run test:research`, vì vai này chỉ đọc. S4 đã chạy cả hai và đều xanh (lint 0 lỗi; test 242/242), và CCoding sẽ tự chạy lại. Cần ghi thêm tệp bàn giao rồi chạy lại `npm run lint`.

**Tệp: `docs/research/context/k4-e7b-review-2026-11-15.md`**
```markdown
**Kết luận:** Sửa nhỏ

# K4 — Phản biện E7b trong bài, nhánh (h), câu cấm, câu trả lời vai CTO (BRIEF-27, @peer-reviewer, 15/11/2026)

Dữ liệu: Nội bộ. Vai chỉ đọc. Không có blocker, không có major; 8 minor. Số dòng tính tại HEAD `a70b1709`.

## Điểm mạnh
- Mọi số E7b ở `paper/paper.md` §6.7 (Bảng E7b-1 `:878–879`, E7b-2 `:887–888`, E7b-3 `:896–905`, BLUF `:845`) và `analysis/decisions/model-per-role.md:21`, `:64–72` khớp nguyên văn `bench/vs-claude/results/e7b-cto/report.md:20–21, 29–30, 36–45`, khóa `e7b.*` ở `facts.json:776–825` và `report.json` (ví dụ chặn nhầm R1b CP 0,1128–0,3223; P2 `diffBoot` [−0,3478; 0,0286], `pAdj` 0,0234375).
- Nhánh (h): `paper.md:909–915` đi đúng D → E → A → B → C → F; mỗi nhánh nêu đủ điều kiện và số; khớp `report.md:52–58` và `analysis/e7b-verify.md:78–90`. F đứng được ở cả năm cách tính (chính, S1, S2, S3a, S3b); ngưỡng S2 = 57 nêu rõ.
- Nhãn P2 "chưa kết luận" đúng QH19/(P5) (`preregistration.md:1670`, `:1751`), dù (g) gốc (`:1590`) gán "chưa phân biệt được". Bài nói rõ lý do là "CI bootstrap chứa 0", không phải "ngược chiều" (`paper.md:907`).
- Câu cấm QH36: không có "đã chứng minh", "xác nhận/tái lập/lặp lại E7", hiệu của riêng model hay "nên đổi model" trong §6.7 và mục 5 của `model-per-role.md`. Bảng E7 cạnh E7b ghi "KHÁC BẢN MÃ" (`paper.md:917`). Mọi câu về R2b gọi là "gói Opus + trần 16".
- §9 chỉ được thêm: `git diff 596c389 HEAD -- preregistration.md` cho 0 dòng xóa, một khối thêm ở `:1777–1804`; `preregistration.lock.json` chỉ thêm khóa mới (sha `7d114203…`).
- Đe dọa còn áp dụng đủ (`paper.md:936–949`): mọi mục (l) còn hiệu lực sau Phụ lục (2) (`preregistration.md:1693`), (P6), đe dọa thêm của PL2 (a), mục rút "trần token", và "số đo đã được xem khi viết khối sai lệch".
- Câu trả lời vai CTO (`paper.md:952–957`, `model-per-role.md:62–78`) nằm trong nhánh F: "chưa chọn được model; không đề xuất đổi", có mức chắc chắn, nói rõ giữ Sonnet "không phải vì E7b cho thấy Sonnet đủ tốt", và tách CTO nghiệm thu khỏi trưởng phòng ở khâu `plan`.
- m1/m3 (`analysis/e7b-analyze.test.mjs`):
  - Hai test QH11 kiểm chuỗi lỗi kiểm (`name`, là chuỗi của `add()` ở `e7b-analyze.mjs:107`, `:110`) bằng `match`/`doesNotMatch` theo cả hai chiều: `:275–276` (vòng giá trị), `:286–287` (infra `apiKey` ⇒ "giá trị lạ"), `:295–296` (thiếu ⇒ "thiếu ở dòng done"), `:304–305` và `:310–311` (`[]` và `null` ⇒ "thiếu"). Vì vậy test phân biệt được hai nhánh QH11.
  - Ca mới `:314–328` có một arm vừa có dòng `[]` vừa có dòng thiếu trường ⇒ một lỗi kiểm, `rows` 2, `seen` `[[],null]`, không in số.
- Kiểm bổ sung bằng git (chỉ đọc), lấp một khoảng mà `e7b-verify.md:106` nêu:
  - `5911bf0c` là commit có thật và chứa `7beb50c1` (D23);
  - từ bản ghim tới HEAD, `e7b-analyze.mjs` và `src/` không đổi;
  - `results/e7b-cto/` chỉ có dòng thêm.

## Blocker
Không có.

## Major
Không có.

## Minor

1. **`paper/paper.md:924`, số lượt E7 bị phân loại lại sai.**
   - Bài ghi "Hai lượt E7 từng bị phân loại lại (lỗi 403) không dùng ở đây". §9 ghi **16 lượt** (R1 8, R2 8; `preregistration.md:1169`) và "Hai nhóm 16 lượt" (`:1606`).
   - Câu "không dùng ở đây" còn dễ hiểu sai: cột E7 (42,2 %/98,4 %; 6,3 %/85,9 %) là số cách chính của E7, tức đã dùng **lượt chạy lại** của 16 lượt đó. Cái không dùng chỉ là bản ghi ban đầu.
   - Đề xuất: "16 lượt E7 (R1 8, R2 8) từng bị phân loại lại do lỗi 403; cột E7 dùng số cách chính (lượt chạy lại), không dùng bản ghi ban đầu."

2. **Mức bằng chứng/chắc chắn của vai CTO không thống nhất.**
   - `paper.md:774` viết "mức bằng chứng cũng chỉ 'vừa'… còn ở E7b hai gói khác nhau…".
   - `model-per-role.md:21`, cột Mức, ghi "**Thấp**". Thang của chính tệp này (`model-per-role.md:9`) chỉ có Vừa / Yếu / Không có, nên "Thấp" nằm ngoài thang. Theo thang, E7b là "Vừa" (đo nội bộ có đăng ký trước).
   - Đề xuất: giữ cột Mức = "Vừa" và ghi riêng "mức chắc chắn của câu trả lời: thấp (nhánh F)", như `paper.md:952`. Hoặc định nghĩa "Thấp" ở dòng 9 rồi sửa `paper.md:774` cho khớp.

3. **`paper.md:955`, câu "chênh lệch chính nằm ở chặn nhầm".**
   - Đọc như khẳng định có khác biệt, trong khi nhãn P2 là "chưa kết luận". Câu không vi phạm QH36 (không gán cho model), nhưng vượt nhãn.
   - Đề xuất: "chênh lệch mô tả lớn nhất ở chặn nhầm (10 so với 1 cặp bất đồng; nhãn P2 'chưa kết luận')".

4. **`paper.md:915`, `:956` và `model-per-role.md:76`, lý do nhánh F và đề xuất "(ii) tăng số mục hoặc số bài".**
   - Bảng theo bài (`report.md:71`): ở `t5-logq`, R1b chặn 6/9 mục đúng, R2b 0/9. Vậy **6 trong 10** cặp "chỉ R1b chặn" của P2 nằm ở một bài.
   - Bootstrap lấy mẫu hai tầng theo 8 bài (`preregistration.md:1587`). Vì vậy CI rộng (cận trên 2,9) chủ yếu do khác biệt giữa các bài; thêm mục trong cùng 8 bài khó làm CI hẹp lại. Đây là suy luận của người phản biện từ bảng theo bài, không chạy lại bootstrap.
   - Đề xuất:
     - nối câu "dồn ở `t5-logq`" (`paper.md:881`, `:943`) với câu về CI rộng ở `:915`;
     - ở việc tiếp theo, ưu tiên "tăng số **bài**" và nói rõ thêm mục trong bài cũ ít tác dụng;
     - nếu muốn phân tích bỏ `t5-logq` thì phải gắn nhãn [Khám phá] và đăng ký riêng, không đưa vào nhãn hay nhánh.

5. **`paper.md:952–957`, chưa trả lời trực tiếp câu hỏi (a)(i), (ii) đã đăng ký (`preregistration.md:1521–1523`).**
   - (i) có định nghĩa khóa: "chặn nhầm nhiều" khi cận dưới CP > 10 %. Với 11,3 % thì câu trả lời mô tả là "có, gói Sonnet + trần 6 vẫn chặn nhầm nhiều theo định nghĩa (a)". Bài chỉ nói dạng phủ định ("nhánh E không đứng").
   - (ii): điều kiện (1) và (2) của A thỏa. Đó là câu trả lời mô tả cho (ii) đối với **gói**, không phải đối với model.
   - Đề xuất: thêm hai câu, mỗi câu gắn [Mô tả] và nhắc đây là gói.

6. **`preregistration.md:1804`, câu "Khối này chưa vào `preregistration.lock.json`; việc đó thuộc S4" đã lỗi thời.**
   - S4 đã khóa khối này (sha `7d114203…`). Khối đã khóa thì không sửa được.
   - Đề xuất: ghi một dòng ở `CHANGELOG.md` mục BRIEF-27 (hoặc phụ lục sau) rằng khối đã khóa ở S4, kèm sha.

7. **`preregistration.md:1802`, câu "Không có sai lệch nào khác…" so với các khoảng còn mở ở `e7b-verify.md:105–106`.**
   - Các khoảng còn mở: chưa mở `responses/` của `83a50beb23`; chưa rà `errorKind` ở 256 bản ghi `calls-accept/`; chưa tra commit ghim.
   - Câu ở §9 chỉ đúng với "các mục đã đối chiếu", và đã ghi đúng như vậy. Nhưng `paper.md:926–934` không nêu các khoảng còn mở. Việc tra commit nay đã có kết quả (xem điểm mạnh).
   - Đề xuất: thêm một câu giới hạn ở `paper.md:934`.

8. **`analysis/e7b-verify.md:38`, cách suy "Mục đúng R2 qua mà R1 chặn: 13 R2-only non-block − 3 lỗi = 10" khó theo dõi.**
   - Kết quả 10 đúng: R1b chặn 13 mục đúng, cả hai chặn 3, nên chỉ R1b chặn là 10.
   - Đề xuất viết lại theo dạng đó ở bản sau. Không ảnh hưởng số.

## Đối chiếu danh sách câu về model/CTO ở `CHANGELOG.md:20–32`
| Tệp:dòng | Đối chiếu với nhánh F | Kết quả |
|---|---|---|
| `paper.md:3` | "không đề xuất đổi model" | Đạt |
| `paper.md:774` | Câu cũ "cho tới khi đo lại R2" được giữ trong ngoặc kèm cập nhật; mức "vừa" lệch `model-per-role.md:21` | Đạt, kèm minor 2 |
| `paper.md:845` | BLUF, "không đưa ra đề xuất đổi model CTO" | Đạt |
| `paper.md:860` | Câu thiết kế (gói, không phải model) | Đạt |
| `paper.md:870` | Điều kiện nhánh A; "Nhánh đạt: F" | Đạt |
| `paper.md:907` | "không phải hiệu của riêng model" | Đạt |
| `paper.md:915` | "không đủ để đề xuất đổi" | Đạt, kèm minor 4 |
| `paper.md:937` | Đe dọa trần bất cân xứng | Đạt |
| `paper.md:952–957` | Trong nhánh F, mức "thấp" | Đạt, kèm minor 3, 4, 5 |
| `model-per-role.md:21` | "Giữ sonnet (R1); không đổi", nhánh F | Đạt, kèm minor 2 (nhãn mức) |
| `model-per-role.md:62–78` | Nhánh F, "không được rút ra" | Đạt, kèm minor 4 (`:76`) |

## Kiểm số liệu
- Tính lại p McNemar P2: 2·(1 + 11)/2¹¹ = 0,01171875; Holm ×2 = 0,0234. P1: 5 cặp bất đồng, p = 1. Khớp `report.md:36–37`.
- Cận dưới CP của 4/64 kiểm xấp xỉ Poisson(1,1): P(X ≥ 4) ≈ 0,026, khớp 1,7 %. Cận dưới 11,3 % của 13/64 hợp lý theo xấp xỉ chuẩn. Chưa tính chính xác vì không chạy được công cụ.
- `report.json`: `diffBoot` P2 = [−0,3478; 0,0286], khớp "[-34,8; 2,9]".
- Chưa kiểm: sha256 của `report.md`/`report.json` (chỉ có chữ ghi của K1 ở `report-provenance.md:11–13` và `facts.json:826–827`).

## Câu hỏi bảo vệ thử
1. *"p Holm 0,0234 < 0,05, sao không nói Opus chặn nhầm ít hơn?"* Gợi ý: nhãn khóa trước (QH19/P5) đòi cả McNemar lẫn bootstrap theo bài; CI [−34,8; 2,9] chứa 0. Hai arm khác cả model lẫn trần (QH2), nên dù P2 là "khác nhau" cũng chỉ là hiệu của gói.
2. *"Một lượt `unread` của R2b có làm lệch recall?"* Gợi ý: đó là lỗi JSON (dấu phẩy toàn chiều), không phải chạm trần. Ở S1, hiệu recall là 0,0. F đứng ở cả năm cách tính.
3. *"CI rộng vì n nhỏ hay vì một bài?"* Gợi ý: 6/10 cặp bất đồng P2 nằm ở `t5-logq`, và bootstrap theo bài với 8 cụm. Cần thêm bài, không chỉ thêm mục (minor 4).
4. *"E7b có xác nhận E7 không?"* Gợi ý: không. Hai đợt khác bản mã (D15–D23), Opus còn khác trần; bảng chỉ mô tả, không có p hay CI giữa hai đợt (§9 (i), (k)).
5. *"Vậy giữ Sonnet là vì Sonnet đủ tốt?"* Gợi ý: không. Giữ vì không nhánh nào cho phép đổi. Theo định nghĩa (a)(i), gói Sonnet + trần 6 vẫn "chặn nhầm nhiều" (cận dưới 11,3 % > 10 %). Bước tiếp là tách model khỏi trần (E7c, đăng ký riêng).

## Lệnh đã chạy / cần chạy
- Đã chạy (chỉ đọc): `git diff --stat 596c389 HEAD`; `git diff 596c389 HEAD -- docs/research/preregistration.md` (0 dòng xóa); `git cat-file -t 5911bf0c…` → `commit`; `git merge-base --is-ancestor 7beb50c1 5911bf0c` → exit 0; `git diff --stat 5911bf0c HEAD -- docs/research/analysis/e7b-analyze.mjs src` → rỗng.
- Cần người có quyền chạy sau khi thêm tệp này: `npm run lint`. S4 đã chạy `npm run test:research` (242/242) và `consistency-check` (62 tệp, không lệch). Kiểm thêm sha256: `sha256sum bench/vs-claude/results/e7b-cto/report.md bench/vs-claude/results/e7b-cto/report.json`.
```