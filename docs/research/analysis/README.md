# Công cụ phân tích (`docs/research/analysis/`)

## gates-pairs.mjs

Đổi trường `gates` của `runs.jsonl` (B-12) thành tệp CSV `ref,pred,runId,gate,task,arm` để `agreement.mjs` tính recall, chặn nhầm, κ, CI bootstrap theo lượt.

```
node docs/research/analysis/gates-pairs.mjs <runs.jsonl…> [--arms-json bench/vs-claude/arms.json] --unit decision|run [--gate b02|b10|cto] [--out file.csv]
```

Không có `--out` thì ghi stdout. stderr in số cặp và số dòng bị bỏ theo cổng (cổng `null`).

### Quy ước nhãn

- `ref = '1'` khi tiền tố tên bài khớp kind của cổng trong `arms.json` `_suites.gates.kinds` (`g1-`/`g2-` → b02, `g3-`/`g4-` → b10, `g5-`/`g6-` → cto); ngược lại `'0'`. Bài không thuộc tiền tố nào là bài sạch: `ref = '0'` cho mọi cổng.
- `pred`: b02, b10 lấy `blocked`; cto lấy `!pass`. Giá trị là chuỗi `'0'`/`'1'`.
- `runId` = trường `key` của dòng runs.jsonl.
- Cổng `null` (không có sự kiện `gate.decision`, ví dụ b10 ở làn đơn) hoặc dòng không có `gates` (lượt `infra`) bị bỏ khỏi mẫu của cổng đó.

### Đơn vị

- `--unit run`: mỗi lượt × cổng là 1 cặp.
- `--unit decision`: b10, cto vẫn 1 cặp mỗi lượt (tóm tắt chỉ có một quyết định). b02 chặn: `max(1, rounds)` cặp `pred='1'`; b02 không chặn: 1 cặp `pred='0'`. Cặp chung `runId` nên CI là bootstrap cụm theo lượt.

### Giới hạn (đọc trước khi trích số)

- Tóm tắt không cho biết lượt b02 đã bị chặn có kết thúc ở trạng thái không chặn (vòng cuối đạt) hay không, nên **không thêm** cặp `pred='0'` cho lượt đã chặn. Số quyết định `pred='0'` của b02 vì thế bị đếm thiếu và recall theo quyết định có thể lệch lên.
- Thứ tự và nhãn từng vòng bị mất. `ref` là nhãn theo bài, **chưa phải nhãn tại thời điểm cổng** như B-12 trường 7(b) đòi hỏi; nhãn đó cần đọc `events.jsonl` từng vòng.
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
