# Công cụ phân tích (`docs/research/analysis/`)

## gates-pairs.mjs

Đổi trường `gates` của `runs.jsonl` (B-12) thành tệp CSV `ref,pred,runId,gate,task,arm` để `agreement.mjs` tính recall, chặn nhầm, κ, CI bootstrap theo lượt.

```
node docs/research/analysis/gates-pairs.mjs <runs.jsonl…> [--arms-json bench/vs-claude/arms.json] --unit decision|run [--gate b02|b10|cto] [--negatives clean|cross] [--label gate|task] [--out file.csv]
```

Không có `--out` thì ghi stdout. stderr in số cặp và ba loại dòng bị bỏ, tách riêng: cổng `null` (theo cổng), bài cài lỗi loại khác (theo cổng), dòng không chạy cổng (theo `status`: `infra`, `error`…).

### Quy ước nhãn

- `--label gate|task`, mặc định `gate`; giá trị khác → mã 2. `task` = nhãn theo bài (hành vi cũ). `gate` = nhãn tại thời điểm cổng (B-12 trường 7(b)), áp dụng như sau:
  - **b02**: `ref = '1'` khi `gates.b02.checksRed > 0` (số lệnh kiểm đỏ tại cổng), `'0'` khi `= 0`, bất kể tên bài. b02 đọc chính lệnh kiểm nên recall b02 gần như theo định nghĩa; đại lượng có thông tin là q̂ (lỗi có sống tới cổng không).
  - Dòng b02 **thiếu `checksRed`** (không có hoặc không phải số ≥ 0) **lùi về nhãn theo bài**, không dừng (exit 0). Báo ở stderr (`b02: N/M dòng thiếu checksRed → dùng nhãn theo bài`) và trong dòng tổng hợp `gates-pairs: b02 nhãn hiệu lực: …; số dòng lùi: N/M; tỷ lệ lùi: P%` (stderr luôn có; stdout chỉ khi có `--out`, để không lẫn vào CSV). Nhãn hiệu lực: `gate`, `gate (lùi một phần)`, hoặc `task (lùi)` khi lùi 100 %. M = số dòng b02 vào mẫu (sau khi loại bài cài lỗi loại khác).
  - **cto**: dùng nhãn cuối lượt (= nhãn theo bài). Lập luận: ở làn đơn nghiệm thu là pha cuối nên trạng thái test ẩn cuối lượt là trạng thái CTO đã thấy [chờ research-lead chốt, kèm kiểm trong mã orchestrator].
  - **b10**: nhãn theo bài.
  - Trạng thái trường: `checksRed` chưa có trên nhánh này (`GateDecisions.b02 = { blocked, rounds }` ở `src/bench.ts:241`; `gateDecisions()` ở `src/bench.ts:250-260`); Phòng Dev đang thêm (D10 mục C). Tới lúc đó mọi dòng b02 lùi 100 %.

- `ref = '1'` khi tiền tố tên bài khớp kind của cổng trong `arms.json` `_suites.gates.kinds` (`g1-`/`g2-` → b02, `g3-`/`g4-` → b10, `g5-`/`g6-` → cto); ngược lại `'0'` — **nhưng chỉ cho bài sạch** (không khớp tiền tố nào), áp cho mọi cổng.
- Bài cài lỗi **loại khác** (ví dụ g1/g2 khi xét `--gate cto`) mặc định **bị bỏ khỏi mẫu của cổng đó** (`--negatives clean`), vì cổng chặn đúng ở đó không phải chặn nhầm; giữ với `ref='0'` sẽ làm lệch precision và tỉ lệ chặn nhầm, và điểm dừng 'Có hại' (CD 3.5) dựa trên chặn nhầm ở lượt sạch sẽ sai. `--negatives cross` giữ hành vi cũ (chỉ để so sánh).
- `pred`: b02, b10 lấy `blocked`; cto lấy `!pass`. Giá trị là chuỗi `'0'`/`'1'`.
- `runId` = trường `key` của dòng runs.jsonl.
- Cổng `null` (không có sự kiện `gate.decision`, ví dụ b10 ở làn đơn) bị bỏ khỏi mẫu của cổng đó, đếm theo cổng.
- Dòng không có `gates` (lượt `infra`, `error`) bị bỏ khỏi mọi cổng, đếm riêng theo `status` để RUNLOG phân biệt cổng không chạy với lỗi hạ tầng.

### Đơn vị

- `--unit run`: mỗi lượt × cổng là 1 cặp.
- `--unit decision`: b10, cto vẫn 1 cặp mỗi lượt (tóm tắt chỉ có một quyết định). b02 chặn: `max(1, rounds)` cặp `pred='1'`; b02 không chặn: 1 cặp `pred='0'`. Cặp chung `runId` nên CI là bootstrap cụm theo lượt.

### Giới hạn (đọc trước khi trích số)

- Tóm tắt không cho biết lượt b02 đã bị chặn có kết thúc ở trạng thái không chặn (vòng cuối đạt) hay không, nên **không thêm** cặp `pred='0'` cho lượt đã chặn. Số quyết định `pred='0'` của b02 vì thế bị đếm thiếu và recall theo quyết định có thể lệch lên.
- Thứ tự và nhãn từng vòng bị mất. `ref` là nhãn theo bài, **chưa phải nhãn tại thời điểm cổng** (với `--label gate`, nhãn b02 lấy từ `checksRed` một giá trị mỗi lượt, không phải từng vòng; nhãn từng vòng cần đọc `events.jsonl`).
- Mỗi vòng chặn của một lượt cùng nhận `ref` của bài, dù vòng sau có thể chặn đúng/sai khác vòng đầu.

### Nối với agreement.mjs

Hai bước, một tệp CSV cho mỗi cổng:

```
node docs/research/analysis/gates-pairs.mjs results/…/runs.jsonl --unit decision --gate b02 --out b02.csv
node docs/research/analysis/agreement.mjs --pairs b02.csv --positive 1
```

Không dùng pipe: `--pairs` nhận **đường dẫn tệp**, không đọc stdin. Không trộn cổng: `agreement.mjs` gộp mọi dòng trong tệp thành một ma trận, nên b02/b10/cto phải tính riêng (dùng `--gate`).

### Kiểm

```
node --test docs/research/analysis/gates-pairs.test.mjs
node --test docs/research/analysis/agreement.test.mjs
```
