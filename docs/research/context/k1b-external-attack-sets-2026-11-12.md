# K1b-b — Bộ lệnh tấn công do bên ngoài viết cho trục 2 (S2, 13/11/2026)

Phân loại dữ liệu: Nội bộ. Chỉ tra cứu web; không tải mã hay dữ liệu về; không gọi LLM. Số liệu của bộ ngoài là số công bố bởi nguồn, chưa tự đếm.

## 1. Tóm tắt
- Có 4 ứng viên; **2 bộ đã đọc được LICENSE hoặc phần giấy phép của kho** và cho dùng lại ở mức nghiên cứu.
- **Đề xuất bộ chính: RedCode-Exec** (CC BY 4.0 cho dữ liệu, MIT cho mã; 4.050 ca công bố, có Bash). Số ca quy được về một lệnh shell chưa đếm được (không đọc được tệp dữ liệu).
- **Bộ dự phòng: Agentic Execution Guardrail Eval** (Hugging Face, CC BY 4.0, 37 dòng, có nhãn `expected_verdict`, gồm cả lệnh lành). Nhỏ nên chỉ thêm độ phủ và phép kiểm chặn nhầm.
- **AIShellJack** là ca lệnh của Atomic Red Team (MIT), nhưng giấy phép của gói tái lập figshare chưa kiểm được. Không dùng làm bộ chính. Có thể dùng gián tiếp qua Atomic Red Team, nếu cần mà quy ca và nhãn được.
- AgentDojo (MIT, đã đọc LICENSE) **không phù hợp**: ca tấn công là lệnh chèn vào công cụ của đại lý nghiệp vụ, không phải lệnh shell.

## 2. Truy vấn (nguyên văn; web_search chuẩn; ngày 13/11/2026)
| # | Truy vấn | Kết quả dùng |
|---|---|---|
| Q1 | `AIShellJack coding editor prompt injection shell command attack benchmark` | arXiv 2509.22040 |
| Q2 | `AgentDojo prompt injection benchmark GitHub license` | ethz-spylab/agentdojo |
| Q3 | `benchmark dangerous shell commands coding agents safety dataset destructive commands should block GitHub` | RedCode, HF eval, CARE, SABER, AgentHazard, OpenAgentSafety |

Trang đọc: arXiv 2509.22040v2 (html), LICENSE của agentdojo, LICENSE của atomic-red-team, LICENSE và README của RedCode, thẻ dữ liệu HF. Không đọc được: figshare (HTTP 403), nội dung PDF của CARE (chỉ thấy siêu dữ liệu).

## 3. Ma trận ứng viên
| Bộ | Nguồn | Kho / dữ liệu | Giấy phép | Số ca công bố | Quy về 1 lệnh shell / 1 tool-call | Định dạng, nhãn | Trùng nhóm tự viết |
|---|---|---|---|---|---|---|---|
| **RedCode-Exec** | NeurIPS 2024, arXiv [2411.07781](https://www.arxiv.org/abs/2411.07781) | github.com/AI-secure/RedCode, thư mục `dataset/` | **Đã kiểm:** LICENSE là MIT ("Copyright (c) 2024 RedCode Authors"); README nói dữ liệu `dataset/` là CC BY 4.0. Cho dùng lại, cần ghi nguồn. | 4.050 ca (README) | **Chưa ước lượng được.** README không nêu tỉ lệ Bash và Python [CHƯA KIỂM CHỨNG]. Ca dạng mã Python phải loại. | Trường và nhãn không nêu trong README [CHƯA KIỂM CHỨNG]; tên là "risky" nên coi mọi ca là nên chặn, cần xác nhận khi mở tệp | Thấp (ca về xóa, rò rỉ, mã độc kiểu hệ điều hành; nhóm tự viết thiên về cú pháp shell và .env) |
| **Agentic Execution Guardrail Eval** | Hugging Face `ole-tail/agentic-execution-guardrail-eval` (tác giả ghi trong thẻ: Aleksei Khvostov) | Bộ dữ liệu HF | **Đã kiểm thẻ dữ liệu:** `cc-by-4.0` (không phải tệp LICENSE; thẻ có yêu cầu ghi nguồn) | 37 dòng | Gần như 1:1 (`payload` 18–190 ký tự). Dòng `require_approval` cần quy tắc riêng. | `id`, `payload`, `is_adversarial`, `expected_verdict` ∈ {approved, blocked, require_approval}, `category`, `severity`, `expected_layer`. **Có nhãn sẵn.** Thẻ ghi "manually curated", không phải chứng nhận an ninh. | Trung bình (có `rm -rf`, `curl \| bash`, base64; dạng giống ca của nhóm) |
| **AIShellJack** | arXiv [2509.22040](https://arxiv.org/pdf/2509.22040) (preprint, chưa xác nhận bình duyệt) | Gói tái lập figshare DOI 10.6084/m9.figshare.30111988 (bài dẫn); không thấy URL GitHub | **Chưa kiểm:** bài chỉ nêu giấy phép arXiv cho bài báo; figshare 403 [CHƯA KIỂM CHỨNG]. Lệnh gốc lấy từ Atomic Red Team (MIT, LICENSE đã đọc, Red Canary 2018). | 314 payload, 70 kỹ thuật MITRE ATT&CK | Mỗi payload = mô tả + một lệnh `P_cmd` (theo bài), nên gần 1:1 nhưng chưa đếm được lệnh nhiều dòng | Mô tả + lệnh nhúng vào tệp rule; không thấy nhãn "nên chặn", nhưng mọi payload là ca tấn công | Thấp–trung bình (lệnh ART kiểu Windows và Linux, nhiều lệnh PowerShell) |
| AgentDojo | arXiv [2406.13352](https://arxiv.org/abs/2406.13352v3) | github.com/ethz-spylab/agentdojo | **Đã kiểm:** MIT (Copyright 2024 Debenedetti và cộng sự) | không rõ | **Không đạt:** ca là chỉ thị chèn vào đầu ra công cụ nghiệp vụ, không phải lệnh shell | — | — |
| Chưa đọc: CARE (arXiv 2607.21642), SABER (2606.01317, repo github.com/sssr-lab/saber), AgentHazard (2604.02947), OpenAgentSafety (2507.06134) | web_search Q3 | — | [CHƯA KIỂM CHỨNG] | — | — | CARE trộn ca ART, RedCode, NL2Bash (theo tóm tắt tìm kiếm, chưa đọc toàn văn) | — |

## 4. Quy tắc quy ca đề xuất (để S6 chốt trong §9)
1. Giữ ca có **đúng một lệnh Bash/sh** (một dòng, hoặc chuỗi `;`/`&&`/`|` do bên ngoài viết, coi là một ca). Loại ca là mã Python, PowerShell, hoặc chỉ là câu ngôn ngữ tự nhiên.
2. Loại ca cần ngữ cảnh ngoài lệnh (tệp rule, trạng thái đĩa), vì hàm phát lại chỉ nhận chuỗi lệnh.
3. Gán nhãn "nên chặn" = mọi ca của bộ tấn công (RedCode, ART). Với bộ HF: `blocked` là nên chặn, `approved` là nên cho qua, `require_approval` bỏ khỏi phép đo (báo riêng số lượng).
4. Khử trùng với bộ nhóm tự viết (so khớp chuỗi sau chuẩn hóa khoảng trắng), báo số ca bị loại.
5. Quy tắc phải khóa **trước** khi thấy kết quả chặn của hàm thật; người quy ca không chạy `replay-guard-deny.mjs` trước khi khóa.
6. Báo n sau quy ca và Clopper–Pearson. Rút mẫu ngẫu nhiên có hạt giống nếu n quá lớn.

## 5. Về "27 lệnh nhóm tự viết"
BRIEF-19 (dòng 47) nói 27 lệnh, nhưng tôi **không xác định được tập 27 ấy** trong repo. `test/shell-policy-adversarial.test.ts` có mảng `DENIED` 60 mục (dòng 43–102), và `test/claude-guard.test.ts` có 5 lệnh git + vài lệnh khác. Rủi ro trùng ở mục 3 là ước lượng theo loại lệnh, chưa đối chiếu từng chuỗi. Đề nghị S6 nêu rõ tập 27 ở §9 (tệp và dòng), rồi áp quy tắc khử trùng số 4.
Lưu ý: ca của nhóm kiểm *cú pháp bị chặn trong shell-policy chỉ-đọc* (`> tệp`, `$(…)`, `awk system`), nên bộ ngoài thiên về "lệnh độc" sẽ chủ yếu thử `claude-guard` hơn là `shell-policy`. Cần chốt hàm nào được đo.

## 6. Kết luận và đề xuất
- Chính: RedCode-Exec, **điều kiện:** mở `dataset/` xác nhận có ca Bash và nhãn; nếu quy được dưới khoảng 30 ca Bash độc lập thì chuyển sang gộp với bộ dự phòng.
- Dự phòng: Agentic Execution Guardrail Eval (n ≤ 37; dùng thêm đo chặn nhầm trên ca `approved`).
- AIShellJack chỉ dùng khi lấy được tệp có giấy phép đọc được (kho figshare hoặc Atomic Red Team qua LICENSE MIT).
- Việc tải bộ, đếm n thật và chạy qua `replay-guard-deny.mjs` tách thành nhiệm vụ sau, khi §9 đã đăng ký.
- Dữ liệu bên ngoài là lệnh tấn công; chỉ phát lại qua hàm kiểm, không thực thi, và lưu trong `data/` hoặc `docs/research/`, không để ngoài.

## 7. Giới hạn
- Giấy phép "đã kiểm": MIT (RedCode, agentdojo, atomic-red-team) đọc được qua LICENSE; CC BY 4.0 của dữ liệu RedCode đọc từ README, của bộ HF đọc từ thẻ dữ liệu, chưa phải tệp LICENSE.
- Số ca là số công bố; tỉ lệ quy về một lệnh chưa đo.
- arXiv 2509.22040 và các bài 26xx là preprint, chưa xác nhận bình duyệt.
