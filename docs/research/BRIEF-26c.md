# Phòng Nghiên cứu, gói 19c: đóng m1–m7 của phản biện 26b trước khi ghim E7b

**Gói nhỏ: 2 hạng mục. Ngân sách 3M token.** Giao 15/11/2026. Việc nối của BRIEF-26b (T-20261115-105245-bbd): làm tiếp trên nhánh `ccoding/t-20261115-105245-bbd`.

**Căn cứ:** biên bản CTO của BRIEF-26b. Chưa nghiệm thu vì hai lý do.
- **Tệp nháp `_ed.py` bị commit ở gốc repo, ngoài phạm vi.** Người điều phối đã gỡ (commit `3c1e39d8` trên nhánh). Trong gói này **không tạo tệp nháp hay script tạm nào trong cây làm việc**: sửa tệp trực tiếp bằng công cụ sửa tệp, vì mọi tệp trong cây làm việc đều được commit. Phòng Dev đang làm thư mục nháp và luật lint chặn tệp nháp (D26).
- **Phản biện K4 của 26b còn 7 minor** (`outputs/research-S4-peer-reviewer.md` của nhiệm vụ 26b):
  - **m1:** `e7b-analyze.mjs:56,59` tính "hết giờ" cả khi `error` rỗng mà `errorKind === 'timeout'`. Phụ lục (2) (d) (`preregistration.md:1718-1719`) ghi `error` rỗng là **không tính**, và `errorKind` của `calls.jsonl` chỉ để đối chiếu. Test `e7b-analyze.test.mjs:227` và RUNBOOK `:118` chép cách hiểu sai này.
  - **m2:** thứ tự xét điều kiện 2 trước điều kiện 3 của luật hết giờ chưa ghi ở đâu. Phụ lục (d) yêu cầu báo riêng từng điều kiện.
  - **m3:** QH11 chỉ kiểm `acceptAuthSources` trên dòng `done`; một dòng `infra` có khóa API sẽ lọt. QH11 (`preregistration.md:1743`) không giới hạn ở dòng `done`.
  - **m4:** test `e7b-analyze.test.mjs:172-185` có tên không khớp nội dung. Nhánh P5 "một phép có ý nghĩa, phép kia không" chưa được kiểm xuyên qua `analyzeE7b` → bảng → `decision.labels`.
  - **m5:** QH3, QH4, QH32, QH33 thi hành ngoài bộ phân tích, nhưng chưa ghi điều này.
  - **m6:** `RUNBOOK.md:13` dẫn `ARM_DIR` sai dòng (đúng là `bench/vs-claude/e7/lib.mjs:26`). `:85` gán `waitTimeoutMs` cho `run.mjs`, trong khi đây là mặc định của `runCto` (`lib.mjs:215`).
  - **m7:** kiểm QH1 (blob `selected.json`) chạy sau `analyzeE7b`, trái câu "trước mọi tính toán" ở (e).
- **D24 đã gộp vào `perf/vs-claude-loop`.** Tên cờ và tên trường đúng như BRIEF-26b. Nhánh này chưa có D24; người điều phối đối chiếu lại khi gộp và khi chạy thử.

**Phạm vi:**
- **Được sửa:** `docs/research/analysis/e7b-analyze.mjs`, `docs/research/analysis/e7b-analyze.test.mjs`, `bench/vs-claude/results/e7b-cto/RUNBOOK.md`, `docs/research/CHANGELOG.md`.
- **Không sửa:** `preregistration.md`, `preregistration.lock.json`, `src/`, mã `bench/`. Luật đã khóa thắng; **sửa mã theo luật, không sửa luật**.
- **Không chạy LLM để đo.**
- Dữ liệu: **Nội bộ**.

**Kế hoạch:**
- Mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K2 giao cho `@peer-reviewer`, chỉ đọc.
- Mô tả hạng mục của vai chỉ đọc không nhắc tới việc thực thi lệnh, test hay script, kể cả bằng câu phủ định.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — data-scientist: sửa m1–m7**
- **m1:** bỏ nhánh `errorKind` ở luật hết giờ. Sửa test `:227` thành kỳ vọng không đếm; sửa RUNBOOK `:118`.
- **m2:** ghi thứ tự xét điều kiện vào chú thích bảng của báo cáo và vào RUNBOOK. Không đổi mã QH.
- **m3:** kiểm giá trị `authSource` lạ trên **mọi** dòng arm (gồm `infra`); giữ kiểm "thiếu trường" cho riêng dòng `done`. Thêm test dòng `infra` có `["apiKey"]` ⇒ lỗi kiểm, không in nhãn.
- **m4:** đổi tên test cho đúng nội dung. Thêm một ca xuyên suốt cho P5: dữ liệu giả để McNemar có ý nghĩa còn CI bootstrap chứa 0 ⇒ `decision.labels` là "chưa kết luận" và nhánh F.
- **m5:** ghi ở chú thích đầu script và trong RUNBOOK: QH3, QH4, QH32, QH33 thi hành ngoài bộ phân tích, kèm chỗ thi hành của từng mã.
- **m6:** sửa hai chỗ dẫn ở RUNBOOK.
- **m7:** đưa kiểm QH1 lên trước lời gọi `analyzeE7b`. Thêm test: blob sai ⇒ không gọi phân tích.
- **Chung cho cả hạng mục:**
  - Đối chiếu tên trường D24 với `bench/vs-claude/e7/lib.mjs` (`acceptStats`) trên `perf/vs-claude-loop`, đọc bằng `git show perf/vs-claude-loop:bench/vs-claude/e7/lib.mjs`. Lệch thì sửa script cho khớp và ghi vào báo cáo.
  - Không để tệp nháp trong cây làm việc; báo cáo liệt kê `git status` cuối.
  - CHANGELOG ghi m1–m7 đã đóng.

**K2 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Đọc và đối chiếu:**
  - từng m1–m7 đã đóng, kèm tệp:dòng;
  - luật hết giờ trong script khớp từng chữ phụ lục (2) (d);
  - không có tệp nào ngoài phạm vi trong diff so với nhánh 26b;
  - câu cấm của §9 không bị vi phạm trong RUNBOOK và CHANGELOG.
