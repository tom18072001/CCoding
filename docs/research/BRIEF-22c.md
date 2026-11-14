# Phòng Nghiên cứu, vòng 4 gói 16c: đóng C2-r, làm cứng FX19, đối chiếu số còn treo, phản biện lại

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 14/11/2026.

**Căn cứ:** biên bản nghiệm thu của CTO cho BRIEF-22b (chưa nghiệm thu).
- **C2-r (chặn):** còn 14/24 tham chiếu `tệp:dòng` sai vào `agents/*.md` và `src/quality-gate.ts`, đối chiếu với mốc `ccc76cc0`.
  - Vd. `research-lead.md:51` phải là `:58`; `dev-lead.md:57` phải là `:61`.
  - `logic-map-check.mjs` không bắt được, vì chỉ so chuỗi con của ký hiệu trong dải dòng: ký hiệu ngắn hay chung khớp nhầm.
- **M-r1, M-r2:** xem biên bản.
- Phản biện K4 lần trước **hết lượt công cụ** giữa chừng nên không ra kết luận.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9).
- **Không sửa:** `src/`, `bench/` (trừ chữ trong `results/*/report.md`).
- Không chạy benchmark.
- Dữ liệu: **Nội bộ**; không ghi đường dẫn máy.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`.

## Hạng mục

**K1 — data-scientist: làm cứng FX19 trước, rồi sửa mọi tham chiếu**
- **`logic-map-check.mjs`:**
  - mỗi tham chiếu phải kèm ký hiệu **đặc thù**: tên hàm, hằng, tiêu đề mục hoặc cụm chữ ≥ 12 ký tự có trên đúng dòng đó ở mốc;
  - khớp **đúng dòng**, không theo dải;
  - tham chiếu thiếu ký hiệu đặc thù là lỗi ở chế độ `--strict`; bật `--strict` mặc định;
  - phủ cả tham chiếu vào `agents/*.md`, `src/**`, `bench/**`.
- **Test:**
  - 14 ca sai đã biết phải đỏ;
  - ca đúng phải xanh;
  - cố ý lệch một dòng ⇒ exit 1.
- Chạy script mới trên toàn bộ `analysis/decisions/logic-map.md`, `report.md`, `improvement-backlog.md` (khối B-20 trở đi), `paper/paper.md` §4.4. Sửa **mọi** tham chiếu sai theo `git show ccc76cc0:<tệp>`, cho tới khi exit 0 ở `--strict`.

**K2 — academic-writer: M-r1, M-r2, số còn treo**
- **M-r1:** mô tả lỗi trong `logic-map.md` và trạng thái trong backlog phải khớp mã ở mốc. Lỗi nào đã sửa sau mốc (D16b, D17, D18a, D18b, D18c) thì ghi "đã sửa ở <gói>, commit <hash>".
- **M-r2:** xác nhận các khóa `brief22-p1-a-*`, `brief22-p2-a-pct` trong `facts.json` khớp nguồn.
- **Số treo:**
  - "5/5 lượt Opus ở khâu plan" (`paper.md`, `model-per-role.md`): đối chiếu với `bench/vs-claude/results/decisions/kpi-office.json` và `calls-limits.json`;
  - số tác giả arXiv: đọc trang arXiv chính, ghi đúng.
- `facts.json`, `CHANGELOG.md` đồng bộ; `consistency-check` đạt.

**K3 — data-scientist: lệnh kiểm tra dạng glob**
- `node --test docs/research/scripts/` cho exit 1 trên Node 24 Windows. Ghi lệnh chuẩn dạng glob (`node --test docs/research/scripts/*.test.mjs`) vào `docs/research/README.md` hoặc chỗ đang ghi lệnh kiểm tra của dự án Nghiên cứu.
- Chạy `scorecard.mjs --check` và ghi kết quả.

**K4 — peer-reviewer: phản biện lại, gọn trong trần lượt**
- **Viết kết luận trước** theo mẫu (**Đạt** / **Sửa nhỏ** / **Chưa đạt**) ở đầu tệp, rồi mới bổ sung chi tiết. Không đọc lại toàn bộ bài.
- Kiểm bằng lệnh, không đọc tay từng dòng:
  - `logic-map-check.mjs --strict`, `consistency-check.mjs`, `scorecard.mjs --check` exit 0;
  - lấy ngẫu nhiên 10 tham chiếu (seed ghi trong báo cáo), đối chiếu tay với `git show ccc76cc0:<tệp>`.
- `git status` sạch.
