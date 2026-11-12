# E7: CTO nghiệm thu trên lỗi lọt cổng — sổ chạy

Thiết kế: `docs/research/preregistration.md` §9, "Bản chốt E7 và E8" (v2.6). Sổ tay chạy: `bench/vs-claude/e7/README.md`. Phân loại dữ liệu: **Nội bộ**.

## Trước khi chạy (5/11/2026, người điều phối, không gọi LLM)

- **Lấy mẫu** (`sample.mjs`, trên máy cloud):
  - kho G-4 `g4-survivors.json`, sha256 `8a16ae33…`; `g-mutation.jsonl`, sha256 `782dc8b0…`;
  - được **65 lỗi + 65 đúng ở 8 bài** (trần 10 mỗi bài, tối đa 1 lỗi mỗi lượt): c1 1+1, c2 10+10, c3 10+10, c5 10+10, t1 4+4, t2 10+10, t3 10+10, t5 10+10;
  - `items.json` sha256 `8b4ee9c8…`.
- **Chạy thử bước chuẩn bị trên máy cloud** (Linux, chỉ để kiểm harness; danh sách chốt chính thức làm lại trên máy chạy):
  - chuẩn bị được 128 mục;
  - 2 mục lỗi của `t5-logq` có test ẩn đạt ở cả 3 lần chạy lại, nên bị loại (`label-mismatch`). Dự phòng của bài chỉ còn 1 mục và mục đó cũng không đạt. Vì vậy bài này còn 9 mục lỗi, và 1 mục đúng bị bớt để giữ ghép cặp;
  - nguyên nhân: bộ test ẩn của `t5-logq` cho số test khác nhau giữa các lần chạy cùng mã (123–146). Đã chuyển cho Phòng Nghiên cứu ở BRIEF-19 K3 để đánh giá ảnh hưởng tới G-3.
- **Mục chạy thử** (không thuộc mẫu, không vào phân tích): `067cd64cc5`, mục đúng dự phòng của `c1-iis-ecs`.
- **Test:** `npm run test:bench` 258/258, gồm `test/e7.test.mjs` 6/6. Ca R1 chạy qua `Orchestrator` thật với runtime giả: chặn mục lỗi, duyệt mục đúng, văn bản R1 = văn bản R3, không lộ nhãn.

## Mốc khóa và chạy

_(người chạy ghi: hash commit bản ghim, sha256 từng script, phiên bản CLI, sha256 `ccoding.local.json`, giờ bắt đầu từng bước, số mục chốt và mục thay, lỗi hạ tầng, giờ máy, USD. Không ghi kết luận của arm trước khi đủ.)_

### Dựng bản ghim và kịch bản nối tiếp (12/11/2026, người điều phối, được giám đốc giao quyền tự duyệt lúc 22:57)

- **Bản ghim:** `C:\Users\admin\ccoding-vs-claude\ccoding-e78`, detached ở `d70959c0611ad1237f03007576e0d31b344c6fe3`. Từ `cd90988` (mốc khóa E7/E8) tới bản này chỉ thêm dữ liệu và RUNLOG; không đổi `src/` hay `bench/vs-claude/e7`, `e8`.
  - `npm ci` và `npm run build` xong (`npm-setup.log` có SETUP-OK).
  - `ccoding.local.json` chép từ `ccoding-3e`, sha256 `0ee7b0a6…`.
  - CLI 2.1.318.
- **Kiểm nhanh trên Windows** (`ops/e7-wincheck.mjs`, 2 mục dự phòng, không gọi LLM, không ghi vào `results`):
  - mục lỗi `t2-orders` tìm lại được vị trí đột biến (khớp kiểu `artifact`) và `npm test` xanh;
  - mục đúng `c2-burst-alert` đạt;
  - repo trên Windows dùng `core.autocrlf=true`, nhưng vị trí đột biến vẫn khớp.
- **Kịch bản nối tiếp `e78-run.ps1`** (bản sao `setup/e78-run.ps1`, sha256 `cc729833…`; kèm `setup/e78-check.mjs`, sha256 `d7080ec3…`). Chạy bằng WMI lúc 23:08 ngày 12/11, pid 1244.
  - Chờ dòng "XONG 8 khoi" của B-14, rồi:
    1. E7 chạy thử mục `067cd64cc5`, tự kiểm `promptSha` R1 = R3 và bộ công cụ;
    2. bước 1 (chốt danh sách);
    3. bước 2 (chạy chính);
    4. E8.
  - Gặp hạn mức thì chờ 30 phút, không giới hạn số lần. Chạy lại được sau khi máy khởi động lại.
  - `e78-check.mjs` chỉ đọc trường hạ tầng (`status`, `promptSha`, `tools`, `maxConcSubtasks`), không đọc `verdict`.
- **Sai lệch nhỏ so với sổ tay (`e7/README.md`, bước 2):** `selected.json` và `prep.jsonl` không commit trước bước chạy chính. Thay vào đó, kịch bản ghi sha256 của hai tệp vào `ops/e78-run.txt` trước lượt gọi đầu tiên của bước chính. Lý do: chạy không người trực, không chờ được commit từ máy khác. Mốc giờ trong `selected.json` (`at`) và dòng đầu của `runs.jsonl` cho phép kiểm thứ tự.
