# Phòng Nghiên cứu, gói 17b: đóng các tiêu chí còn mở của BRIEF-24 trước khi chạy E9-lite

**Gói nhỏ: 4 hạng mục. Ngân sách 5M token.** Giao 15/11/2026. Việc nối của BRIEF-24 (T-20261115-042813-dc1): làm tiếp trên nhánh `ccoding/t-20261115-042813-dc1`. Người điều phối đã gộp `perf/vs-claude-loop` (`41992cb9`: D19, D20 + D20b, D21) vào nhánh này ở `2b1b6937`.

**Căn cứ:**
- Biên bản nghiệm thu của CTO cho BRIEF-24: chưa nghiệm thu.
  - sha256 của `labels.json` mới chưa khóa ở §9; dòng sha256 cũ đã lỗi thời.
  - `gateFirst` trong `e9lite.mjs` khác định nghĩa ở §9.
  - Tài liệu mâu thuẫn: `paper.md` còn chỗ giữ chỗ về nhãn mới và sha256; README và `facts.json` mang số 13/13 cũ.
  - Cờ dừng M1, M2 (`authSource` bỏ qua `null`, `ccodingCommit`, `claudeCliVersion`) chưa có test.
  - `@peer-reviewer` ghi "Chưa duyệt", còn 3 major.
- **Lint mới (D20), từ nay là lệnh kiểm tra bắt buộc của dự án, đỏ là nhiệm vụ không xong.** Trên nhánh này `npm run lint` báo 4 lỗi:
  - `prereg-lock`: hai khối mới ở §9 chưa vào tệp khóa (dòng 1336 và 1408);
  - `machine-path`: `preregistration.md:1451` (§10) có đường dẫn home của máy cloud. Khối §10 đã khóa nên **không sửa chữ**. Thêm ngoại lệ vào `scripts/lint/allow.json` theo neo chữ, kèm lý do: câu nhắc tới đường dẫn để cấm chép, nằm trong khối đã khóa;
  - `lint-runner`: mục `machine-path` cũ của `preregistration.md` trong `baseline.json` không còn khớp, phải xóa.
- Cách sửa từng rule: `docs/LINT.md`.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e9lite/`, `scripts/lint/allow.json`, `scripts/lint/baseline.json` (chỉ xóa mục), `docs/research/preregistration.lock.json` (chỉ qua `--add-new`).
- **Không sửa:** `src/`, mã `bench/`, `scripts/lint/*.mjs`.
- Không chạy planner, không gọi LLM để đo.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật):
- `npm run lint`
- `npm run test:research`

## Hạng mục

**K1 — data-scientist: khóa chuẩn, cờ dừng, lint**
- Sinh lại `gold.json` và `labels.json` bằng script. Ghi sha256 mới ở §9 dưới dạng một khối **mới** (không sửa khối cũ), nói rõ khối cũ lỗi thời.
- **M1, M2:** kiểm trong `e9lite.mjs`, không sửa mã `bench/`. Có test trên `runs.jsonl` giả cho từng cờ:
  - `authSource` là `null` với runtime thật thì cảnh báo, không bỏ qua;
  - `ccodingCommit` hoặc `claudeCliVersion` khác nhau giữa các lượt ⇒ dừng phân tích.
- **Lint:**
  - `node scripts/lint/prereg-lock.mjs --add-new`;
  - thêm ngoại lệ `allow.json` cho dòng §10;
  - xóa mục baseline lỗi thời;
  - `npm run lint` exit 0.

**K2 — @methodologist: `gateFirst` và tính nhất quán của §9**
- `gateFirst` trong `e9lite.mjs` khớp đúng định nghĩa §9. Nếu định nghĩa §9 sai thì thêm khối đính chính ở §9, ghi rõ là trước khi chạy. Không sửa khối cũ.
- Đọc toàn bộ các khối E9-lite ở §9: nhãn, luật khớp, câu cấm, quy tắc dừng thống nhất với mã và README.

**K3 — academic-writer: tài liệu**
- Đồng bộ `paper.md`, `facts.json`, `bench/vs-claude/results/e9lite/` (README nếu có), `CHANGELOG.md` với nhãn mới (3 chia được, 10 không chia được) và sha256 mới.
- Không còn `[CẦN SỐ LIỆU]` hay số 13/13 cũ. Dùng Grep.

**K4 — peer-reviewer: phản biện lại (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- Xác nhận 3 major của vòng trước đã đóng, kèm tệp:dòng.
- Đọc kết quả `npm run lint` và `npm run test:research` mà CCoding đưa: phải exit 0.
