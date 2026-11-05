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
