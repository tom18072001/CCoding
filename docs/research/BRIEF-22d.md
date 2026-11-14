# Phòng Nghiên cứu, vòng 4 gói 16d: đóng ba lỗi nhỏ và hai tiêu chí chưa kiểm được của BRIEF-22c

**Gói nhỏ: 4 hạng mục. Ngân sách 5M token.** Giao 15/11/2026.

**Căn cứ:** biên bản nghiệm thu của CTO cho BRIEF-22c (T-20261114-233050-491): 5/8 tiêu chí đạt, C2-r đã đóng (445/445 ở `--strict`). Còn mở:
- **m1:** số đếm lệch giữa các tệp: `improvement-backlog.md` và `CHANGELOG.md` ghi 444, lần kiểm cuối ra 445.
- **m2:** nhật ký kiểm (`context/brief22c-checks-2026-11-14.md`) có khối `git status --short` chạy trước commit nên không rỗng; `--sample` chưa chạy lại sau commit cuối.
- **m3:** với tham chiếu dải, `--sample` in dòng đầu dải thay vì dòng chứa ký hiệu (vd. `orch:1865-1867` in 1865, còn `parsePlan` ở 1867).
- **Chưa kiểm được (1):** ý của tham chiếu. FX19 chỉ kiểm ký hiệu có trên đúng dòng; mẫu 10 có 1 ca lệch ý.
- **Chưa kiểm được (2):** 14 ca C2-r mà test dựng lại chưa đối chiếu với biên bản gốc. Bảng gốc nay đã lưu nguyên văn ở `context/brief22b-k4-c2r-2026-11-14.md`.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9).
- **Không sửa:** `src/`, `bench/`, `agents/`. Không chạy benchmark.
- Dữ liệu: **Nội bộ**; không ghi đường dẫn máy.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy trước và sau, và đưa kết quả cho reviewer):
- `node docs/research/scripts/logic-map-check.mjs --strict`
- `node docs/research/scripts/consistency-check.mjs`
- `node docs/research/analysis/decisions/scorecard.mjs --check`
- `node --test "docs/research/scripts/*.test.mjs" "docs/research/analysis/*.test.mjs"`

## Hạng mục

**K1 — data-scientist: m3, đối chiếu 14 ca, rồi m2**
- **m3:** `--sample` in dòng thật chứa ký hiệu (dòng N hoặc M của dải, đúng dòng mà phép kiểm đã khớp). Có test cho tham chiếu dải.
- **14 ca C2-r:** đối chiếu từng ca trong `logic-map-check.test.mjs` với bảng gốc ở `context/brief22b-k4-c2r-2026-11-14.md`.
  - Bảng: ca trong bảng gốc → ca trong test → trùng hay khác.
  - Ca khác hoặc thiếu thì sửa test cho đúng bảng gốc; test vẫn phải đỏ trên bản sai và xanh trên bản đúng.
- **m2, làm sau cùng, sau commit cuối của K1–K3:**
  - chạy `--sample 10` với seed đã ghi ở BRIEF-22c, và bốn lệnh kiểm ở trên;
  - chạy `git status --short` và lưu đúng đầu ra (phải rỗng);
  - thêm vào `context/brief22c-checks-2026-11-14.md` một mục mới "Chạy lại sau commit cuối (BRIEF-22d)", giữ nguyên các mục cũ.

**K2 — academic-writer: m1**
- Thống nhất số đếm ở `improvement-backlog.md`, `CHANGELOG.md` và mọi chỗ khác (dùng Grep tìm "444" và "445"). Cách ghi: "444 ở lần kiểm của S2 BRIEF-22c, 445 ở lần kiểm cuối", hoặc chỉ ghi số cuối kèm mốc.
- `facts.json` có khóa cho số này thì đồng bộ; `consistency-check` phải bắt được nếu số lệch.

**K3 — data-scientist: kiểm ý trên mẫu 30 tham chiếu**
- `--sample 30` với seed **mới** (ghi rõ), không trùng mẫu 10 của BRIEF-22c.
- Mỗi tham chiếu: đọc câu trong bài và dòng thật ở mốc, ghi một trong ba: **đúng ý**, **lệch ý** (dòng có ký hiệu nhưng không đỡ được câu), **không rõ**.
- Sửa mọi ca lệch ý, theo `git show ccc76cc0:<tệp>`.
- Ghi tỉ lệ lệch ý kèm CI 95 % Clopper–Pearson vào `analysis/decisions/logic-map.md` (mục giới hạn) và `CHANGELOG.md`. Tỉ lệ là ước lượng trên mẫu, không phải kết luận cho toàn bộ 445 tham chiếu.

**K4 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu câu trả lời: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`. Sau đó mới bổ sung chi tiết.
- Đọc mục mới của nhật ký kiểm, bảng 14 ca và bảng 30 tham chiếu. Lấy 5 ca trong bảng 30 để tự đối chiếu: dòng thật đã in sẵn ở nhật ký.
- Còn chặn thì nêu rõ để vòng bổ sung sửa.
