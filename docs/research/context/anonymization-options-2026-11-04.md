# Phương án ẩn danh khi nộp bài (K4, N-5) — 04/11/2026

Phân loại dữ liệu: **Nội bộ**. Tác giả: @academic-writer (S4). Giám đốc chọn mức.
Đối chiếu: `docs/research/paper/paper.md` bản v0.5 (CHỈ ĐỌC, không sửa), `bench/vs-claude/arms.json`, `bench/vs-claude/results/*/RUNLOG.md`, `src/`, commit nền `1a31f1f` (nhánh `ccoding/t-20261104-123641-21b--s4`).
Lưu ý đường dẫn: bài nằm ở `docs/research/paper/paper.md`, không phải `paper/paper.md` như đề bài ghi.

## 1. Khuyến nghị (BLUF)

- **Làm sau D12 và sau bài báo v0.6, trên bản sao nộp bài** (ví dụ `docs/research/paper/submission/`), không sửa `paper.md` gốc. Lý do: D12 thêm arm B0F/B1F và v0.6 sẽ đổi số hiệu, tên mục; ẩn danh trước đó phải làm lại.
- **Chọn mức theo nơi nộp:** nơi nộp **không yêu cầu** double-blind → mức (a) hoặc (c); nơi nộp **bắt buộc** double-blind → mức (b). Chưa biết nơi nộp nên chưa chọn được; khuyến nghị tạm: chuẩn bị mức (a) làm nền vì (b) là (a) cộng thêm.
- Tóm tắt bài đã tự ghi "dự án ứng dụng thật được ẩn danh" (dòng 3) — đó là ẩn danh *dữ liệu khách*, khác với ẩn danh *tác giả/công cụ* trong tài liệu này.

## 2. Kiểm kê (công cụ Grep, chế độ `count`)

**Cách đọc số:** Grep `count` đếm **số dòng khớp**, không đếm số lần xuất hiện. `paper.md` có nhiều dòng rất dài (tóm tắt, bảng), nên số lần xuất hiện thực tế **lớn hơn** các số dưới đây. Dùng làm cận dưới khối lượng; trước khi làm phải chạy lại với `-o` trên bản sao.

### 2.1 `docs/research/paper/paper.md` (tổng 3 phần: thân bài, Phụ lục A, danh mục tham khảo)

| Nhóm | Mẫu Grep (ripgrep, regex) | Số dòng khớp |
|---|---|---|
| Tên công cụ | `CCoding` | 48 |
| Mã nội bộ B/D/BRIEF/V4/E | `\b[BD]-[0-9]+\|BRIEF-\|V4-\|\bE[0-9]\b` | 53 |
| Tên arm B0…B7, A0-…, A1… | `\b(B[0-9]{1,2}F?\|A[0-9]-[a-z]+)\b` | 68 |
| Mã tệp nội bộ R1…R18 | `\bR[0-9]{1,2}\b` | 103 |
| Hash commit (7 ký tự trong backtick, hoặc `a..b`) | ``` `[0-9a-f]{7}`\|\b[0-9a-f]{7}\.\.[0-9a-f]{7}\b ``` | 24 |
| Đường dẫn `src/`, `test/*.test` | `src/\|test/[a-z-]+\.test` | 7 |
| Đường dẫn tài liệu/bench/dữ liệu | `docs/research\|bench/vs-claude\|\.ccoding\|preregistration\|runs\.jsonl\|runs\.csv\|arms\.json\|RUNLOG` | 8 |
| Thuật ngữ chỉ có tiếng Việt/nội bộ | `làn nhanh\|làn đơn\|làn đầy đủ\|đủ phòng\|Phòng Nghiên cứu\|giám đốc\|văn phòng` | 49 |
| Tham chiếu tới Tom | `github\.com\|gitlab\|\bTom\b\|tom18072001\|anhchitruong\|Trương` | 1 dòng (dòng 706, 1 lần `Tom`; dòng quá dài nên Grep không hiển thị ngữ cảnh — **cần đọc tay**) |
| URL kho mã của dự án | `github\.com\|gitlab` | 0 (không thấy URL kho mã; URL còn lại là của nguồn ngoài, ở danh mục tham khảo) |

Hash đã thấy tận mắt (từ kết quả Grep, không phải toàn bộ): `d7600f6`, `78cc7b6`, `838a5f1`, `7fa6305`, `5866cda`, `3ff7df3`, `c55a249`, `28d041d`, `6b84363`, `37f88b6`, `e0bd2f4..9e6079b`, `e0bd2f4`, `7fb18ba`, `1333eef`.
Đường dẫn `src/` đã thấy: `src/config.ts`, `src/orchestrator.ts` (`:633`, `:1083`, `:1981`), `src/planner.ts`, `src/prompts.ts:543`, `src/history.ts:56`, `src/bench.ts:612`, `test/fast-lane.test.ts`.
Đầu bài (dòng 1–6) có: tiêu đề chứa "CCoding", chữ ký "Phòng Nghiên cứu", ghi chú phiên bản v0.5 so với v0.4 (lộ lịch sử bản thảo).

### 2.2 `bench/vs-claude/arms.json` (phạm vi rò rỉ của phương án (b))

- `"kind": "ccoding"`: **12 dòng** (12 arm kiểu ccoding). Nhãn `label` có "CCoding default", "CCoding, no meeting", "CCoding, no review", "CCoding, all Opus (optional)"… Tên khóa B0…B7 và A0-opus/A0-sonnet/A1/A2 trùng với tên trong bài.
- Ngoài `arms.json`, cùng mẫu `ccodingCommit|"ccoding"|ccoding-` khớp **421 lần trong 140 tệp** dưới `bench/vs-claude` (đa số `results/*/result.json`, `ccoding-task.json`, `config*.json`, `summary.json`, và `harness/*.mjs`, `run.mjs`). Tên thư mục kết quả cũng chứa chữ ccoding (ví dụ `C5/t5-logq.ccoding-fastlane.1`).
- **Không sửa được** (đề bài: không sửa `bench/`, `arms.json`) — vì vậy ở mức (b) tên công cụ nằm sâu trong dữ liệu thô; chỉ ẩn danh được qua bản sao hoặc lớp đổi tên khi xuất.

### 2.3 `bench/vs-claude/results/*/RUNLOG.md`

Mẫu `CCoding|ccoding`, số dòng khớp: `study-cloud` 6, `gates-pilot` 5, `large-pilot` 3, `local-3e` 2, `b7prime` 1 → **17 dòng / 5 tệp**. `b14-diag/RUNLOG.md` không khớp. Các RUNLOG còn chứa mã B-xx/E-x/V4-x và `ccodingCommit` (hash) — chưa kiểm kê chi tiết; không cần cho quyết định mức.

### 2.4 `src/`

Mẫu `CCoding|ccoding`: **230 lần khớp (dòng) trong 26 tệp** (kết quả có phân trang `head_limit` 15 nên chỉ thấy 15 tệp đầu; tổng 230/26 do Grep báo). Nhiều nhất: `src/orchestrator.ts` 78, `src/prompts.ts` 24, `src/cli.ts` 18, `src/config.ts` 11, `src/diff.ts` 9. Mã nguồn còn tên gói/biến, thông báo tiếng Việt, và tệp `AGENTS.md`/`CLAUDE.md` ở gốc kho (nêu tên dự án, chưa kiểm kê). **Không sửa `src/`** trong gói này.

## 3. Ba mức

### Mức (a) — Giữ tên công cụ, bỏ mã nội bộ

**1) Những gì bị thay**

| Đối tượng | Ví dụ trong `paper.md` | Thay bằng |
|---|---|---|
| Mã nội bộ B-xx/D-xx/BRIEF/V4/E | dòng 536 "**B-15:** đo giá trị của họp…" | Mô tả thuần ("hạng mục đo giá trị họp") hoặc đánh số lại trong bài |
| Mã tệp R1…R18 | dòng 4, 93 "tệp R10 §2", "R18" | Số hiệu Phụ lục/Bảng của bài; giữ ánh xạ riêng cho người duyệt |
| Hash commit | dòng 107 `d7600f6`, dòng 215 `e0bd2f4` | Nhãn phiên bản ("bản trước sửa", "bản sau sửa") và giữ bảng hash trong tệp phụ |
| Đường dẫn `src/` | dòng 550 `src/orchestrator.ts` | "bộ điều phối" / "mô-đun prompt" |
| Ghi chú phiên bản/lịch sử bản thảo | dòng 3 "So với v0.4…" | Xóa |
| Giữ nguyên | tiêu đề "CCoding", tên arm B0…B7, "Phòng Nghiên cứu" nếu coi là tên đơn vị | — |

**2) Tái lập:** Reviewer chạy lại được: phân tích thống kê từ dữ liệu đính kèm (nếu kèm), đọc quy trình đo. Không chạy lại được: thứ gì cần tra hash (checkout đúng commit) nếu bảng hash chỉ để ngoài bài; tên arm vẫn khớp `arms.json` nên khớp dữ liệu nếu kho kèm theo.

**3) Việc cần làm**
- Ai: @academic-writer biên tập bản sao; @data-scientist kiểm số khớp sau thay (chạy `consistency-check.mjs`); @peer-reviewer đọc lại.
- Khối lượng ước tính (cận dưới theo số dòng khớp ở §2.1): ~53 + 103 + 24 + 7 + 8 ≈ **195 dòng cần sửa tay hoặc bán tự động** (có chồng lấn giữa các nhóm, nên thực tế ít hơn tổng này). Ước lượng thô, chưa đo.
- Thứ tự: sau D12 và sau v0.6; tạo bản sao nộp bài; không động `paper.md`.

**4) Rủi ro:** Còn tên công cụ nên **không đạt** double-blind nếu nơi nộp yêu cầu; dễ sót mã nội bộ trong bảng dài; mất khả năng tra nguồn trong bài nếu bỏ hash mà không có tệp phụ.

### Mức (b) — Double-blind

**1) Những gì bị thay**

| Đối tượng | Ví dụ | Thay bằng |
|---|---|---|
| Tất cả mục của mức (a) | như trên | như trên |
| Tên công cụ | tiêu đề dòng 1; 48 dòng "CCoding" | Tên trung tính (ví dụ "hệ X") dùng nhất quán, cả trong thân bài, bảng, tên arm hiển thị |
| Tên arm hiển thị | "B0 (đủ phòng)", "CCoding default" | Nhãn trung tính; ánh xạ trong tệp phụ riêng |
| Thuật ngữ nội bộ chỉ có ở Việt | "làn nhanh", "làn đơn", "Phòng Nghiên cứu", "giám đốc", "văn phòng" (49 dòng) | Thuật ngữ chung ("fast path", "single-agent path"); bỏ đơn vị/chức danh |
| Đường dẫn và hash | như (a) | như (a), và bỏ hash trong tệp đính kèm |
| Artefact | thư mục `bench/vs-claude/` (kèm tên ccoding ở 140 tệp) | Bản sao đã đổi tên, đưa lên dịch vụ ẩn danh kho mã. Ví dụ dịch vụ: Anonymous GitHub (`anonymous.4open.science`) **[CHƯA KIỂM CHỨNG: chưa mở trang; chỉ nêu như ví dụ cần kiểm tra]** |
| Tham chiếu tác giả | dòng 706 "Tom" (cần đọc tay) | Xóa/trung hóa; **chính sách tự trích dẫn:** trích công trình trước đó của chính nhóm ở ngôi thứ ba ("Tác giả A (2025)"), hoặc bỏ nếu quá nhận diện; không trích kho mã/website cá nhân |
| Metadata | tên tác giả trong thuộc tính tệp, lịch sử git, `userEmail` | Xuất bản sao không kèm `.git`; xóa metadata PDF/DOCX |

**2) Tái lập:** Reviewer chạy lại được: phân tích từ tệp dữ liệu ẩn danh, nếu bản sao đã đổi tên chạy qua `analyze.mjs` mà không lỗi. Không chạy lại được: **không chạy được chính hệ thống** (nó mang tên thật, ghi `ccodingCommit`, phụ thuộc `src/`); không tái lập từ mã nguồn thật; nếu `analyze.mjs` đọc tên arm cố định thì bản sao phải kiểm lại. Chỉ nên đưa phần phân tích và dữ liệu đã làm sạch, không đưa `src/`.

**3) Việc cần làm**
- Ai: @academic-writer (bài + bản đổi tên), @data-scientist (bản sao dữ liệu, chạy lại `analyze.mjs`, `consistency-check.mjs`, `token-analysis.mjs --check` trên bản sao), @peer-reviewer (đọc hỏi "có lộ danh tính không"), giám đốc (duyệt chính sách tự trích dẫn, tạo tài khoản dịch vụ ẩn danh).
- Khối lượng: lớn nhất. Ngoài ~195 dòng của (a) còn 48 dòng tên công cụ + 49 dòng thuật ngữ + 421 khớp trong 140 tệp dữ liệu. Đổi tên dữ liệu thô cần script xuất có kiểm tra; script này nằm ngoài phạm vi sửa `bench/` của gói hiện tại, nên phải làm trong gói sau, trên bản sao. Ước lượng thô, chưa đo.
- Thứ tự: **sau D12 và v0.6**. Làm trước D12 sẽ phải làm lại vì D12 thêm B0F/B1F vào `arms.json`.

**4) Rủi ro:** Sót danh tính qua một trong ~420 khớp dữ liệu, URL, metadata hoặc văn phong tiếng Việt đặc thù; bản sao có thể lệch số với bản gốc (cần chạy lại kiểm); dịch vụ ẩn danh có thể hết hạn hoặc không chạy được nội dung lớn **[CHƯA KIỂM CHỨNG]**; ẩn danh không ngăn reviewer đoán ra qua tên chuẩn "multi-agent coding" khi công cụ đã công bố; tự trích dẫn quá nhiều làm lộ.

### Mức (c) — Giữ nguyên, kèm kho mã

**1) Những gì bị thay**

| Đối tượng | Ví dụ | Thay bằng |
|---|---|---|
| Nội dung bài | — | Không đổi (v0.6 giữ nguyên tên, mã, hash) |
| Kho mã | `src/`, `bench/vs-claude/`, `docs/research/` | Đính kèm hoặc liên kết công khai; thêm README tái lập |
| Việc phải thêm | — | Làm sạch dữ liệu nhạy cảm trước khi công khai (bài đã ghi "dự án ứng dụng thật được ẩn danh", dòng 3); rà bí mật/khóa theo `AGENTS.md` |

**2) Tái lập:** Đầy đủ nhất: reviewer checkout đúng hash, chạy `npm test`, chạy lại `analyze.mjs`. Không chạy lại được: các lượt gọi LLM thật (tốn tiền, phụ thuộc dịch vụ); dữ liệu của dự án ứng dụng thật đã ẩn danh.

**3) Việc cần làm**
- Ai: @data-scientist (README tái lập, kiểm lệnh), @academic-writer (đoạn "Tính sẵn có của dữ liệu và mã"), giám đốc (quyết định công khai kho, giấy phép; rà phân loại Nội bộ → Công khai theo Data Protection Gate trong `AGENTS.md`).
- Khối lượng: nhỏ cho bài, vừa cho việc rà kho trước khi công khai.
- Thứ tự: sau v0.6; có thể song song D12 vì bài không đổi, nhưng kho phải cố định ở commit gộp D12 để hash trong bài khớp.

**4) Rủi ro:** Lộ danh tính hoàn toàn — **loại nếu nơi nộp bắt buộc double-blind**; rò rỉ nội dung Nội bộ khi công khai kho (phải rà theo Data Protection Gate); hash trong bài trỏ tới commit chưa công khai nếu quên đẩy.

## 4. Mức nào hợp loại nơi nộp nào (chỉ mức chung)

| Loại nơi nộp | Mức hợp | Ghi chú |
|---|---|---|
| Hội nghị/tạp chí bắt buộc phản biện kín hai chiều | (b) | (a) và (c) có nguy cơ bị loại vì vi phạm quy định ẩn danh |
| Nơi phản biện một chiều hoặc không yêu cầu ẩn danh | (c), hoặc (a) nếu muốn bài gọn | (c) cho điểm cộng về tái lập |
| Bản tiền in (preprint) / báo cáo kỹ thuật / nộp nội bộ | (c) | Không có ràng buộc ẩn danh |
| Chưa rõ nơi nộp | (a) làm nền | Từ (a) lên (b) là phần việc cộng thêm |

**Chính sách của nơi nộp cụ thể: [CHƯA KIỂM CHỨNG]** — tài liệu này chưa mở trang chính sách của hội nghị/tạp chí nào, nên không trích điều khoản. Khi giám đốc chọn nơi nộp, @literature-researcher mở trang hướng dẫn tác giả, ghi URL đã xem và điều khoản về: ẩn danh, preprint trước phản biện, kho mã ẩn danh, tự trích dẫn.

## 5. Bảng tóm tắt

| | (a) Giữ tên, bỏ mã nội bộ | (b) Double-blind | (c) Giữ nguyên + kho mã |
|---|---|---|---|
| Đạt double-blind | Không | Có (nếu làm sạch đủ) | Không |
| Tái lập của reviewer | Phân tích; tra hash hạn chế | Chỉ phân tích dữ liệu đã làm sạch; không chạy hệ thống | Đầy đủ (trừ gọi LLM thật) |
| Khối lượng (cận dưới) | ~195 dòng bài | (a) + 48 + 49 dòng bài + ~421 khớp/140 tệp dữ liệu | Nhỏ (bài) + rà kho |
| Người làm chính | @academic-writer | @academic-writer, @data-scientist, giám đốc | @data-scientist, giám đốc |
| Thời điểm | Sau D12 + v0.6, bản sao | Sau D12 + v0.6, bản sao | Sau v0.6; kho cố định ở commit D12 |
| Rủi ro chính | Sót mã; không đạt blind | Sót danh tính; lệch số bản sao | Lộ danh tính; rò dữ liệu Nội bộ |

## 6. Phạm vi và giới hạn

- Không sửa `paper.md`, `arms.json`, `src/`, RUNLOG. Chỉ đọc và ghi tệp này.
- Số đếm là **số dòng khớp**, nhiều dòng của bài rất dài nên số lần xuất hiện thực lớn hơn. Dòng 706 (có "Tom") và nhiều dòng khớp bị Grep cắt vì quá dài; chưa đọc tay.
- Chưa kiểm kê: `AGENTS.md`/`CLAUDE.md`, `docs/research/*` ngoài `paper.md`, metadata git (tên người commit `tom18072001` có trong lịch sử git — mức (b) phải xuất không kèm `.git`).
- Ước lượng khối lượng là thô, chưa đo.
- Giả định: "thuật ngữ chỉ có tiếng Việt" được xấp xỉ bằng danh sách 7 cụm trong mẫu Grep; không toàn diện.
