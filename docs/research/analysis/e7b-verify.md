# E7b: thẩm định thực thi và tính đúng của phân tích (BRIEF-27 K2, @methodologist, 15/11/2026)

Phân loại dữ liệu: **Nội bộ**. Phiên bản 1.0. Không sửa `e7b-analyze.mjs`, `report.md`, `report.json`, `RUNLOG.md`, `RUNBOOK.md`, `run/`, `calls-accept/`. Vai này chỉ đọc nên mọi phép tính dưới đây là tính tay từ `run/runs.jsonl`, `report.md`, `report.json` và `results/e7-cto/items.json` (nhãn `kind`); không chạy script nào.

Lệnh đã dùng cho `report.md`: `node docs/research/analysis/e7b-analyze.mjs --runs bench/vs-claude/results/e7b-cto/run/runs.jsonl --data bench/vs-claude/results/e7b-cto/calls-accept` (từ `report-provenance.md`).

## 1. Đối chiếu RUNLOG và `runs.jsonl` với §9 và bảng QH

| Điều khoản | Yêu cầu | Thấy ở | Kết quả |
|---|---|---|---|
| Bản ghim (QH6) | commit `5911bf0c…` | RUNLOG; `"ccodingCommit"` khớp ở 256/256 dòng `runs.jsonl` | Khớp. Chưa tự tra được commit này trong worktree (lệnh `git cat-file` bị chặn); tin RUNLOG và trường trên dòng |
| CLI | `2.1.318` | 256/256 dòng `"claudeCliVersion":"2.1.318 (Claude Code)"`; RUNLOG | Khớp |
| Một tiến trình, `--arms R1,R2 --arm-config --selected` (QH3) | một lệnh `run.mjs` | `run/config-2026-11-15T06-59-07-851Z.json` (một tệp): `argv` có `--arms R1,R2`, `--arm-config R1=…config-R1b.json,R2=…config-R2b.json`, `--selected …e7-cto\selected.json`; RUNLOG: một lần gọi, thoát 0 | Khớp |
| Thứ tự Latin (QH3) | bảng Latin 2 arm (`latinOrders(2)` = `[[0,1],[1,0]]`, `bench/vs-claude/lib/queue.mjs:121`) | Thứ tự dòng trong `runs.jsonl` của cả 128 mục: mục thứ lẻ chạy R1 trước R2, mục thứ chẵn chạy R2 trước R1 (mục 1 `579737a262` R1→R2; mục 2 `83e889c1b1` R2→R1; … mục 128 `3e6d1fdce0` R2→R1) | Khớp, 64 mục R1 trước, 64 mục R2 trước |
| Mẫu (QH1) | 128 mục, 64 lỗi, 64 đúng | `report.md` "Mục chốt 128"; `report.json` `planned` 64/64, `prepExcluded` rỗng; tổng theo bài 64 + 64 | Khớp |
| Chạy lại (QH7, QH32, QH33) | `infra` chạy lại; hết hạn mức thì dừng và chạy lại đúng lệnh | RUNLOG: một lần gọi, không dừng, không `--only`; `runs.jsonl` 256 dòng `done`, không dòng `"error":` hay `infra` nào; đúng 1 dòng cho mỗi (mục, arm) | Không có tình huống nào để áp dụng; không vi phạm |
| Hạn mức (QH32) | không chạm | RUNLOG: không chạm; không có dòng `rate-limit` | Khớp |
| Cặp thiếu (QH21, QH22) | arm > 3 hoặc chênh ≥ 3 ⇒ F | `report.md`: 0 và 0 | Không kích hoạt |
| `maxTurns` (QH12) | 6 (R1), 16 (R2) | 128 dòng `"maxTurns":6,` và 128 dòng `"maxTurns":16,` | Khớp |
| `acceptCalls` (QH5) | 1 | 256/256 dòng `"acceptCalls":1` | Khớp |
| `acceptAuthSources` (QH11) | `["none"]` | 256/256 dòng | Khớp |
| `extraConfigSha256` (QH6) | `91cc507d…` (R1b), `3f62d742…` (R2b), khớp `SHA256SUMS` | 256/256 dòng mang một trong hai giá trị; `SHA256SUMS` đúng hai giá trị này; `armConfigSha256` trong `config-*.json` trùng | Khớp |
| `models` (QH2) | Sonnet (R1), Opus (R2) | `report.json`: `claude-sonnet-5-5`, `claude-opus-5-5` | Khớp |
| 403/Cloudflare (QH31) | không có | 8 dòng khớp mẫu `403` nhưng đều là chuỗi con của số hay mã băm (ví dụ `25403`, `…a32403`); không có dòng `error`, không có `Failed to authenticate`/`Cloudflare` | Khớp |
| `capped` (QH10) | ghi trường `acceptTurnCapped` | 256/256 dòng `"acceptTurnCapped":false`; `report.md`: `capped` 0 (ghi) | Khớp. Max `acceptTurns` R2b là 17 trong khi trần là 16 (xem điểm lệch 5) |
| R3 không chạy (QH34) | không có arm khác | `armIds` của config là `["R1","R2"]` | Khớp |

**Điểm lệch tìm thấy ở bước (1):**
1. RUNBOOK mục 6 ghi `--data ..\e7b-data`; lần phân tích dùng `calls-accept/` (bản rút gọn, chỉ lượt `accept`).
2. Số trường của `calls-accept/`: giao việc ghi 8 trường (`taskId`, `phase`, `authSource`, `turnCapped`, `turns`, `toolCalls`, `errorKind`, `model`). Bản ghi mẫu thật (`w1/runs/T-20261115-135911-dca/calls.jsonl`) có `taskId`, `phase`, `model`, `authSource`, `turnCapped`, `turns`, `toolCalls`, **`stopReason`**, và không có `errorKind` (chỉ xem một bản ghi; không rà cả 256). RUNLOG liệt kê cả `errorKind` và `stopReason`. Không ảnh hưởng số: script chỉ đọc `authSource`, `turnCapped`, `turns` cho đối chiếu và báo "Không lệch".
3. RUNBOOK mục 5 viết `--ccoding-data ..\e7b-data`; `config-*.json` ghi `<home>\ccoding-vs-claude\e7b-data` (đã thay đường dẫn máy bằng `<home>`). Cùng thư mục chức năng, chỉ khác cách viết; không kiểm được vì đường dẫn đã che.

## 2. Tính tay các số của `report.md`

Nguồn: 256 dòng `runs.jsonl` (R1: 74 `block`, 54 `pass`; R2: 64 `block`, 63 `pass`, 1 `unparsed`; tổng 138 + 117 + 1 = 256), và nhãn `kind` từ `items.json`.

**Mục lỗi không bị chặn** (đối chiếu từng id): R1 `pass`: `bba88b7b48` (c5), `12e71b2f74` (t1), `83a50beb23` (t3). R2 không chặn: `62f9187905` (c3, `unparsed`), `ae511c6caf` (t2), `83a50beb23` (t3), `a3b75ec1ff` (t3).
**Mục đúng bị chặn:** suy từ tập `pass`: R1 54 pass − 3 lỗi = 51 đúng qua ⇒ 64 − 51 = 13 chặn nhầm. R2 non-block 64 − 4 lỗi = 60 đúng qua ⇒ 64 − 60 = 4 chặn nhầm. Mục đúng R1 qua mà R2 chặn: `ce08766025` (1 mục). Mục đúng R2 qua mà R1 chặn: 13 R2-only non-block − 3 lỗi = 10.

| Số | Tính tay | `report.md` | Kết luận |
|---|---|---|---|
| Recall R1b | (64 − 3)/64 = 61/64 = 95,3 % | 61/64 = 95,3 % | Khớp |
| Recall R2b (chính) | (64 − 4)/64 = 60/64 = 93,75 % → 93,8 % | 60/64 = 93,8 % | Khớp |
| Chặn nhầm R1b | 13/64 = 20,3 % | 13/64 = 20,3 % | Khớp |
| Chặn nhầm R2b | 4/64 = 6,25 % → 6,3 % | 4/64 = 6,3 % | Khớp |
| Youden J | 95,3 − 20,3 = 75,0 (0,953125 − 0,203125 = 0,75); 93,75 − 6,25 = 87,5 | 75,0 / 87,5 | Khớp |
| Bất đồng P1 (lỗi) | chỉ R1b chặn = R2 không chặn, R1 chặn: `62f9187905`, `ae511c6caf`, `a3b75ec1ff` = 3; chỉ R2b chặn: `bba88b7b48`, `12e71b2f74` = 2; cả hai không chặn: `83a50beb23`. Tổng bất đồng 5 | 3 / 2 | Khớp |
| Bất đồng P2 (đúng) | chỉ R1b chặn = 10; chỉ R2b chặn = `ce08766025` = 1; cả hai chặn = 13 − 10 = 3 (và 4 − 1 = 3). Tổng bất đồng 11 | 10 / 1 | Khớp |
| p McNemar P1 | 2·Σ_{i=0..2} C(5,i)/2⁵ = 2·(1 + 5 + 10)/32 = 32/32 = 1 (cắt ở 1) | 1,0000 | Khớp |
| p McNemar P2 | 2·Σ_{i=0..1} C(11,i)/2¹¹ = 2·(1 + 11)/2048 = 24/2048 = 0,01171875 | 0,0117 | Khớp |
| Holm hai phép | p nhỏ nhất là P2: 2 × 0,01171875 = 0,0234375; P1: max(0,0234375; 1) = 1 | P2 0,0234; P1 1,0000 | Khớp |
| Nhãn P1 | bất đồng 5 < 10 ⇒ "chưa phân biệt được" (QH20) | chưa phân biệt được | Khớp |
| Nhãn P2 | bất đồng 11 ≥ 10; p Holm 0,0234 < 0,05 (có ý nghĩa theo McNemar); CI bootstrap [−34,8; 2,9] chứa 0 (không có ý nghĩa theo bootstrap); hai tiêu chí lệch nhau ⇒ "chưa kết luận" (QH19, `labelOf` dòng 49 `mcSig !== bootSig`) | chưa kết luận | Khớp. Đọc kỹ: "chưa kết luận" ở P2 là do McNemar và bootstrap không cùng ý nghĩa, không phải do hai phép ngược chiều (cả hai phép cùng chiều R2b < R1b ở chặn nhầm) |
| Tổng theo bài | lỗi chặn R1: 1+10+10+9+3+10+9+9 = 61; R2: 1+10+9+10+4+9+8+9 = 60; đúng chặn R1: 0+2+0+0+2+1+2+6 = 13; R2: 0+0+0+0+3+0+1+0 = 4; mẫu số lỗi 1+10+10+10+4+10+10+9 = 64 | như bảng "Theo bài" | Khớp |
| USD | 33,079/12,069 = 2,741; USD/mục 12,069/128 = 0,0943; 33,079/128 = 0,2584 | 2,74; 0,09; 0,26 | Khớp (làm tròn) |

**Các cách tính còn lại (dùng cùng tập id):**
- **S1** (unread = chặn): `62f9187905` thành R2 chặn ⇒ R2 recall 61/64; chỉ R1b chặn 3 − 1 = 2; chỉ R2b chặn 2. Report: 2 / 2, hiệu 0,0. Khớp. P1 bất đồng 4 < 10.
- **S2** (bỏ cặp có unread): bỏ `62f9187905` ⇒ n = 63; R1 recall 60/63, R2 recall 60/63; chỉ R1b chặn 2, chỉ R2b chặn 2; chặn nhầm giữ nguyên n = 64. Report: P1 n = 63, 2 / 2. Khớp.
- **S3a/S3b:** `timeoutMissing` = 0 ở cả hai arm nên trùng chính và S1 (QH15). Khớp.

**Chưa tính tay được (cần mã):** CI bootstrap (B = 4000, hạt `20261104`) và biên Clopper–Pearson (cần nghịch đảo Beta). Kiểm thô: Wilson cho 13/64 có cận dưới ≈ 12,3 %, CP 11,3 % cùng bậc và hẹp hơn một chút theo chiều đúng (CP rộng hơn Wilson). Hai thứ này dựa vào kiểm tái lập byte của K1 (`report-provenance.md`), không dựa vào tính tay.

## 3. Ba mục đối chiếu `responses/` với định nghĩa (e)

Định nghĩa (e): "chặn" = khối JSON **đọc được** với `accepted = false`. Lưu ý quan trọng khi đọc: với dòng `parsed = true`, tệp `responses/` chỉ chứa phần văn bản, **không có khối JSON** (`lib.mjs:278` lấy `accepted` từ kết quả nghiệm thu đã phân tích của CCoding, không đọc lại từ văn bản). Vì vậy với dòng đọc được, đối chiếu chỉ so được phần văn bản ("Chưa nghiệm thu"/"Đạt/Không" trong bảng tiêu chí) với `verdict`, không so được trực tiếp khối JSON. Chỉ tệp `unparsed` giữ khối JSON thô.

| # | Mục | Nhãn | `verdict` (R1 / R2) | Đọc `responses/` | Kết luận |
|---|---|---|---|---|---|
| 1 | `579737a262` (t2-orders) R1 | lỗi | R1 `block` | `579737a262__R1.md`: mở đầu "**Chưa nghiệm thu**"; tiêu chí `Không làm hỏng hành vi đang đúng` = **Không** (đổi `now < startsAt` thành `<=`); `npm test` "Đạt (theo báo cáo)". R2 cũng `block` | Nhất quán: chặn đúng cho mục lỗi. Không thể thấy khối JSON trong tệp (đã tách) |
| 2 | `ce08766025` (t1-duration) R2 | đúng | R1 `pass`, R2 `block` (cặp bất đồng, chặn nhầm của R2b) | `ce08766025__R2.md`: "**Chưa nghiệm thu**"; tiêu chí round-trip `parse(format(x)) === parse(x)` với mọi số hữu hạn = **Không** (`1e300` in dạng mũ rồi `parseDuration` ném `TypeError`); chính CTO nói không chạy được `node`/`npm`, kết luận từ đọc mã | Nhất quán với `block`. Theo nhãn E7 là **chặn nhầm** vì mục đạt test ẩn, dù lý do CTO nêu có cơ sở trong SPEC (đúng đe dọa "nhãn đúng không bảo đảm hoàn hảo", (l)). Không phải lỗi phân loại của script |
| 3 | `62f9187905` (c3-shop-bugs) R2 | lỗi | R1 `block`, R2 `unparsed` (cặp bất đồng ở cách chính; trùng ở S1) | `62f9187905__R2.md`: văn bản mở đầu "**Chưa nghiệm thu**", tiêu chí `Không tạo lỗi mới (removeItem vẫn đúng)` = **Không**, và khối JSON ở dòng 26 có `"accepted": false`. Nhưng khối JSON có dấu phẩy toàn chiều `，` (U+FF0C) trước `"followUps"` (…`"risks": […]，"followUps": […]`) nên **không phải JSON hợp lệ** ⇒ `parsed = false`. `error` rỗng, `acceptTurnCapped` false, 5 lượt (không chạm trần 16) | Đúng định nghĩa (e)/(QH9): không đọc được ⇒ `unread`, cách chính **không chặn**. Hệ quả: recall R2b chính = 60/64 thấp hơn thực chất 1 mục so với ý CTO; S1 cho 61/64. Không phải trần lượt. Đây là lý do nhãn và nhánh phải đứng được ở S1 (và đứng được) |

Cũng đã đọc để so sánh: `a394ea7fad__R1.md` (c2-burst-alert, đúng, R1 `pass`): mở đầu "Tôi đề nghị nghiệm thu", mọi tiêu chí Đạt/Chưa kiểm được ⇒ nhất quán với `pass`. `83a50beb23` (t3, lỗi, cả hai arm `pass` = bỏ sót ở cả hai) được xác định từ `runs.jsonl` nhưng **chưa mở** `responses/` của mục này.

## 4. Nhánh (h) và cách đọc năm cách tính

**Thứ tự D → E → A → B → C → F**, nhánh đầu thỏa thì dừng. Ngưỡng: chặn nhầm ≤ 6, recall ≥ 58 (≥ 57 ở S2, n = 63, 58/64 × 63 = 57,09 làm tròn xuống), R1b − R2b ≤ 6.

| Nhánh | Điều kiện | Số | Thỏa? |
|---|---|---|---|
| D | `capped` R2b > 6/128 | `capped` = 0 (cơ sở "ghi": 256/256 `acceptTurnCapped:false`); `unread` R2b = 1 | **Không** |
| E | cận dưới CP chặn nhầm R1b ≤ 10 % | 13/64, cận dưới 11,3 % (`report.md`) > 10 % | **Không** (Sonnet vẫn chặn nhầm "nhiều" theo mốc 10 % ở (a)) |
| A | (1) chặn nhầm R2b ≤ 6/64; (2) recall R2b ≥ 58/64 và R1b − R2b ≤ 6; (3) P2 "khác nhau" chiều R2b < R1b; (4) đứng ở mọi cách tính | (1) 4 ≤ 6 ✓; (2) 60 ≥ 58 ✓, 61 − 60 = 1 ≤ 6 ✓; (3) nhãn P2 = "chưa kết luận" ✗; (4) vì (3) không thỏa ở cả năm cách nên A không thỏa | **Không** (thiếu (3)) |
| B | (1) thỏa, (2) không | (2) thỏa | **Không** |
| C | chặn nhầm R2b > 6/64 | 4 ≤ 6 | **Không** |
| F | còn lại | A thỏa (1), (2), không thỏa (3) | **Đứng**: **F, "Chưa kết luận"** |

**Năm cách tính (chính, S1, S2, S3a, S3b)**, theo `report.md`: cả năm đều F, và (1), (2) thỏa, (3) không thỏa ở cả năm (P2 cùng p 0,0117/0,0234, CI [−34,8; 2,9] ở cả năm). Nhãn P1: "chưa phân biệt được" ở cả năm; nhãn P2: "chưa kết luận" ở cả năm. D và E không thỏa ở cả năm (R1b chặn nhầm không đổi giữa các cách tính vì mục `unread` duy nhất là mục lỗi; `capped` = 0).
Số khác nhau giữa cách tính chỉ nằm ở P1: chính −1,6 (3/2), S1 0,0 (2/2), S2 0,0 (n = 63, 2/2), S3a = chính, S3b = S1.

**Cách đọc "ba/bốn/năm cách tính".** Bảng QH16 và (f) gốc ghi "ba cách tính" (chính, S1, S2); (P4) thêm S3 thành "bốn"; QH27 ghi "cả bốn cách tính (QH16)"; mã và `report.md` tính **năm** cách (S3 tách S3a và S3b, QH15/QH30). Không sửa chữ cũ. **Cách đọc đã dùng:** "S3" của QH16/QH27 = cả S3a và S3b, nên "ba/bốn" cách của câu chữ cũ được đọc như năm cách tính của `report.md`; điều kiện đứng được ở "mọi" cách tính chỉ chặt thêm, không nới. Vì F đứng ở cả năm, kết luận F đứng được ở mọi cách đọc (ba, bốn hay năm).

**Câu S3 có thể chép nguyên văn (nhánh đọc được, nên không cần câu "chưa trả lời được" về nhánh):** "Nhánh (h) là F, 'Chưa kết luận', ở cả năm cách tính: điều kiện (1) và (2) của nhánh A thỏa, điều kiện (3) (phép chặn nhầm mang nhãn 'khác nhau') không thỏa vì McNemar chính xác cho p Holm = 0,0234 nhưng CI bootstrap [−34,8; 2,9] chứa 0, nên nhãn là 'chưa kết luận'."
**Câu cho câu hỏi "model nào hợp với vai CTO" (S3 chép được):** "E7b không đưa ra khuyến nghị đổi model cho vai CTO (nhánh F). Số đo chỉ mô tả: R1b (Sonnet, trần 6) chặn nhầm 13/64, R2b (Opus, trần 16) 4/64; recall 61/64 và 60/64 ở cách chính; hai arm khác nhau ở cả model lẫn trần, không tách được."

## 5. Phát hiện cần ghi thêm

- Max `acceptTurns` R2b = 17 > `maxTurns` 16 (`report.md` bảng lượt accept). `turns` là `num_turns` của CLI, không đồng nhất với thang `--max-turns` (đã cảnh báo ở (b) giới hạn). Không chạm trần (`turnCapped` false mọi dòng). Báo như một quan sát, không như lỗi hạ tầng.
- Một dòng `unread` của R2b là lỗi định dạng JSON (dấu phẩy toàn chiều), không phải lượt bị cắt. Báo cùng chữ với recall chính, kèm S1.
- Nhánh F chủ yếu do bootstrap rộng (CI [−34,8; 2,9]), không do thiếu hiệu ứng thô (10 so với 1 mục bất đồng ở chặn nhầm, p thô 0,0117). Câu cấm (k) vẫn áp dụng: không viết hiệu của riêng model.

## 6. Việc chưa làm và lệnh cần chạy

- Chưa mở `responses/` của `83a50beb23` (lỗi bị cả hai arm cho qua).
- Chưa tra commit `5911bf0c…` bằng git trong worktree; chưa rà 256 bản ghi `calls-accept/` về trường `errorKind`.
- Người có quyền chạy lệnh: `git cat-file -t 5911bf0ce179ff1627fd37d0db1a27a5ba2ed49e`; `node docs/research/analysis/e7b-analyze.mjs --runs bench/vs-claude/results/e7b-cto/run/runs.jsonl --data bench/vs-claude/results/e7b-cto/calls-accept` rồi `cmp` với `report.md` (K1 đã làm).
- `npm run lint` và `npm run test:research` chạy ở S4, sau khi khóa khối §9 mới.
