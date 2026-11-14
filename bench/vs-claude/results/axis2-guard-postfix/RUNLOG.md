# RUNLOG — trục 2 (b) đo lại sau vá (BRIEF-23, 14/11/2026)

Phân loại dữ liệu: **Nội bộ**. Bộ ngoài: công khai, CC BY 4.0, lệnh tổng hợp, không DLCN. Không gọi LLM; chỉ phát lại chuỗi lệnh qua `guardDecision`, không thực thi.

## Mốc đăng ký trước
- Mục §9 "Đo lại trục 2 (b) sau vá" (`docs/research/preregistration.md`): commit S1 `68c54086d7127e2497711b82b2c4d05b9e833359`, giờ commit **2026-11-14T17:12:26+07:00** (gộp vào nhánh nhiệm vụ: `05c6552425cf4b7df78ada1680dbe3b4daf40d8b`, 17:12:27+07:00).
- Mọi lệnh bên dưới chạy sau mốc này (dấu thời gian ghi cạnh từng bước).

## Bước B1 — giấy phép và dữ liệu bộ dự phòng (truy cập 2026-11-14, ~17:15+07:00)
- Nguồn: `https://huggingface.co/datasets/ole-tail/agentic-execution-guardrail-eval`, revision `34ba1bc0bba918774ddf87e15cba1b7a4ba4fdb4` (lastModified 2026-06-24). Tải vào `data/axis2/external-guardrail/` (gitignore, không chạy mã trong đó).
- Trường `license` trong thẻ dữ liệu (README.md front matter), **nguyên văn: `license: cc-by-4.0`**; API cardData cũng ghi `"license":"cc-by-4.0"`. Điều kiện: ghi nguồn (có trong cột `source`).
- Tải về: `eval_cases.jsonl` 37 dòng, sha256 `4e2e1439e4412fcd987e91ec5e9a7098c1dcf77ee19a4686ea8badfe1b9edb91`; README sha256 `a3143e812b0b0bd86bb785fb5eb83b88d418c97f51e242c18cc563cd9133d5de`.
- Trường `expected_verdict` có ở cả 37 dòng; giá trị ∈ {blocked, approved, require_approval} (không giá trị lạ) → phép đo chặn nhầm được làm, nhãn theo §9 dòng 1213.

## Bước B2 — quy ca (quy tắc cố định 1–7, chưa chạy guardDecision)
Lệnh: `node docs/research/analysis/axis2/normalize-external.mjs --jsonl data/axis2/external-guardrail/eval_cases.jsonl --repo . --redcode-cases bench/vs-claude/results/axis2-guard/cases-normalized.jsonl --out bench/vs-claude/results/axis2-guard-postfix` (17:15:30+07:00)

| Bước | n |
|---|---|
| Công bố: dòng trong eval_cases.jsonl | 37 |
| Quy tắc 2: loại khối mã ``` (Python) | 30 (loại 7) |
| Quy tắc 1: giữ đúng một dòng (loại 5 ca nhiều dòng: kịch bản, tài liệu chèn chú thích) | 25 |
| Quy tắc 2: loại câu ngôn ngữ tự nhiên (bắt đầu bằng chữ hoa; loại 10) | 15 |
| Quy tắc 4a/4b/4c: khử trùng trong bộ / với tập tự viết (89 chuỗi) / với RedCode (82) | 15 / 15 / 15 (loại 0) |
| Quy tắc 6: rút mẫu nếu > 500 | không cần |
| **n đo** | **15**: approved 7, blocked 6, require_approval 2 |

Lý do loại từng ca: `normalize-external-steps.json`. Phán đoán của người quy ca: (i) các câu có lệnh nhúng ("Execute command: …", "Run a routine codebase check: …") bị loại vì là câu ngôn ngữ tự nhiên (quy tắc 2), không tách lệnh khỏi câu; (ii) `python -m pip install -r requirements.txt` được **giữ** vì là một lệnh shell, không phải mã Python (script RedCode cũ loại mọi lệnh bắt đầu bằng `python`; tập RedCode không bị ảnh hưởng).

## Bước B3 — KHÓA danh sách (trước khi chạy guardDecision)
- Tệp: `bench/vs-claude/results/axis2-guard-postfix/cases-external.jsonl` (15 dòng)
- **sha256: 63a03aa8cb617b50bae3b1e9f8c54134e476ceddb7e02c3af99ca6049273078f**
- Hash commit khóa: ghi ở dưới ngay sau khi commit.
