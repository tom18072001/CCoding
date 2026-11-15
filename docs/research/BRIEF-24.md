# Phòng Nghiên cứu, vòng 4 gói 17: đăng ký và chuẩn bị E9-lite (planner nào bóc tách tốt hơn), trước khi chạy

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 15/11/2026.

**Căn cứ:**
- `decisions-2026-11-14.md` mục 6b: E9 như đã đăng ký (§9.x, BRIEF-22 K4) cần chuẩn bóc tách do hai người gán, mà dự án không có người gán. Vì vậy chạy **E9-lite [Khám phá]**:
  - chỉ giai đoạn 1, lập kế hoạch, không thực thi;
  - chuẩn suy tất định từ lời giải mẫu;
  - ba arm planner Haiku, Sonnet, Opus.
- D19 (đã gộp, commit `f5802c37`) có sẵn:
  - `options.planOnly`, `options.planModel`;
  - arm `P-H`, `P-S`, `P-O` trong `bench/vs-claude/arms.json`;
  - `bench/vs-claude/e9/gold-from-solution.mjs`: liệt kê tệp thêm/sửa/xóa, số dòng, module giữa `repoDir` và `solutionDir`. Không gán nhãn, không chọn bài.
  - Cách chạy và trường của `runs.jsonl`: `bench/vs-claude/README.md`, mục E9-lite.
- Bài có lời giải mẫu: 13 bài. g1–g6, `l1-modules`, `l2-chain`, t1–t5.
- Bốn việc nhỏ còn lại từ phản biện K4 của BRIEF-22d (biên bản CTO, mục "Việc tiếp theo" 1).

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e9lite/` (mới).
- **Không sửa:** `src/`, mã `bench/`.
- **Không chạy planner, không gọi LLM để đo** trong gói này. Người điều phối chạy bench **sau khi** gói này được nghiệm thu và gộp.
- Dữ liệu: **Nội bộ** (bài bench tổng hợp, không có DLCN).

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy trước và sau):
- `node docs/research/scripts/logic-map-check.mjs --strict`
- `node docs/research/scripts/consistency-check.mjs`
- `node docs/research/analysis/decisions/scorecard.mjs --check`
- `node --test "docs/research/scripts/*.test.mjs" "docs/research/analysis/*.test.mjs"`

## Hạng mục

**K1 — @methodologist: ghi sai lệch E9 → E9-lite ở §9, trước mọi lượt chạy**

Thêm vào `preregistration.md` §9 (chỉ thêm dòng) mục "Sai lệch E9 → E9-lite [Khám phá]", gồm:

**Vì sao lệch:** không có hai người gán chuẩn. E9 gốc vẫn ghi "chưa chạy".

**Bài:** 13 bài có `solutionDir`, liệt kê id. Không thêm, không bớt sau khi thấy kết quả.

**Chuẩn:**
- lấy từ đầu ra `gold-from-solution.mjs`: tập tệp đổi, tập module;
- quy tắc **tất định** gán nhãn "chia được"/"không chia được" từ chuẩn (vd. theo số module đổi), viết bằng lời và bằng mã;
- khóa trước khi thấy bất kỳ kế hoạch nào.

**Arm, lặp, thứ tự:**
- `P-H`, `P-S`, `P-O` × 3 lần lặp;
- `--seed` ghi sẵn;
- làn nhanh như README;
- trần lượt và cấu hình giống nhau.

**Thước đo** (tính trên cả `planRaw` và `planFinal`):
- độ phủ tệp và độ phủ module: phần tử chuẩn có trong tệp nêu ở kế hoạch, chia cho tổng phần tử chuẩn;
- chia thừa trên bài "không chia được";
- số hạng mục; số lượt sửa kế hoạch; cổng đạt lần đầu;
- token có trọng số.
- Ghi rõ luật khớp tệp: chuẩn hóa đường dẫn, khớp module.

**Phân tích:**
- hiệu theo bài (Opus − Sonnet, Haiku − Sonnet), gộp 3 lượt lặp theo bài trước;
- bootstrap theo bài (seed khóa) lấy khoảng 95 %;
- **chỉ mô tả, không kiểm giả thuyết, không Holm**, vì n = 13 bài.
- Phân tầng theo nhãn chia được/không.

**Quy tắc dừng và chạy lại:**
- theo README: model lệch ⇒ `error` và chạy lại; lỗi hạ tầng (403, hết hạn mức, ngắt kết nối) chạy lại, ghi cả lượt đầu;
- dừng cả đợt nếu `authSource` lẫn khóa API.

**Câu cấm:**
- "Opus bóc tách tốt hơn" khi không kèm [Khám phá], n và khoảng;
- mọi câu coi chuẩn từ lời giải mẫu là chuẩn của người.

**Đe dọa:**
- chuẩn tệp chỉ là một cách chia đúng;
- 13 bài nhỏ, tổng hợp;
- `planFinal` bị mã sửa (`shapeFastPlan`, cổng);
- planner thấy repo nhưng không thấy lời giải.

**K2 — data-scientist: chuẩn, mã băm, script phân tích thử trên dữ liệu giả**
- **Chuẩn:**
  - chạy `node bench/vs-claude/e9/gold-from-solution.mjs --out bench/vs-claude/results/e9lite/gold.json`;
  - áp quy tắc nhãn của K1 bằng script, ra `labels.json`;
  - ghi sha256 của hai tệp vào mục §9 của K1 (cùng commit hoặc commit ngay sau, trước khi gói được nghiệm thu).
- **Script `docs/research/analysis/e9lite.mjs`:**
  - đọc `runs.jsonl` của harness, `gold.json`, `labels.json`;
  - ra các bảng của K1;
  - không in gì khi chưa có `runs.jsonl` thật.
- **Test `e9lite.test.mjs`** trên `runs.jsonl` giả, có ca đã biết đáp án:
  - độ phủ 0, 0,5, 1;
  - chia thừa;
  - model lệch bị loại;
  - lượt chạy lại chỉ tính lần cuối, theo đúng quy tắc K1.
- **Việc nhỏ BRIEF-22d:**
  - thêm phép thử đột biến cho nhánh "N tham chiếu khớp" của `consistency-check`;
  - chép nguyên văn đầu ra `clopper-pearson.mjs` vào nhật ký kiểm.

**K3 — academic-writer: việc nhỏ BRIEF-22d và chỗ trong bài cho E9-lite**
- Sửa câu gãy ngữ pháp ở `CHANGELOG.md:41`.
- Thêm cột "dạng nguyên văn" vào bảng 14 ca (`context/brief22d-k1-14ca-2026-11-15.md`).
- `paper.md`: thêm mục khung cho E9-lite (thiết kế, nhãn [Khám phá], "chưa chạy"). **Không có số.**
- `facts.json`, `CHANGELOG.md` đồng bộ.

**K4 — peer-reviewer: phản biện thiết kế (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Kiểm:**
  - quy tắc nhãn và luật khớp có tất định, có được khóa trước khi chạy;
  - thước đo có tính được từ trường `runs.jsonl` mà README liệt kê;
  - phần sai lệch có trung thực (không gọi E9-lite là E9);
  - câu cấm có đủ;
  - test của K2 có ca đã biết đáp án.
- Còn chặn thì nêu rõ để vòng bổ sung sửa.
