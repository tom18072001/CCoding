# Tài liệu bên ngoài: chia việc song song, model cho vai lập kế hoạch và nghiệm thu (14/11/2026)

Phân loại: **Công khai** (chỉ tóm tắt tài liệu đã công bố, không có dữ liệu vận hành). Người soạn: người điều phối. Đây là tóm tắt một báo cáo nghiên cứu sâu (công cụ nghiên cứu web) chạy ngày 14/11/2026.

**Cách dùng cho BRIEF-22 K3:** mỗi số dưới đây phải được kiểm lại ở nguồn chính trước khi đưa vào bài. Phần lớn nguồn thực nghiệm mạnh là **preprint chưa bình duyệt**. Số của blog Anthropic và Cognition là **tự báo cáo**.

## 1. Khi nào nhiều agent có lợi

| Nguồn | Loại | Điểm chính (cần kiểm lại số) |
|---|---|---|
| Geng & Neubig, CAID, arXiv 2603.21489 | preprint | Kiến trúc gần như CCoding: quản lý dựng đồ thị phụ thuộc, worktree, gộp, test. Độ chính xác tăng so với agent đơn: Commit0-Lite 53,1 → 59,1 %, PaperBench 57,2 → 63,3 % (Sonnet 4.5). Chi phí khoảng ×4,3, thời gian khoảng ×2,3; tác giả nói thời gian không giảm đáng kể. 4 kỹ sư tốt hơn 2, 8 kém hơn 4 (nhiều người sửa chung một tệp). "Soft isolation" (không worktree) kém agent đơn trên PaperBench. |
| Kim et al., "Towards a Science of Scaling Agent Systems", arXiv 2512.08296 (bản v3) | preprint | 260 cấu hình, 6 benchmark (có SWE-bench Verified, Terminal-Bench). Bài tách được: tới +80,8 %. Bài lập kế hoạch tuần tự: −39 đến −70 %. **Bão hòa năng lực:** khi agent đơn đã vượt khoảng 45 % thì thêm agent cho lợi ích âm. Trên SWE-bench Verified, mọi kiến trúc nhiều agent kém nhẹ agent đơn. Token tốn 1,6–6,2 lần agent đơn. Mô hình dựa trên đặc trưng bài chọn đúng kiến trúc ở 87 % cấu hình giữ lại. |
| Khatua et al., CooperBench, arXiv 2601.13295 | preprint | Hai agent làm các tính năng có mã chồng lấn: thành công thấp hơn khoảng 30 % so với một agent làm cả hai. |
| Tran & Kiela, arXiv 2604.02460 | preprint | Khi giữ nguyên ngân sách suy luận, agent đơn ngang hoặc hơn nhiều agent trên suy luận đa bước. Không đo trên mã. |
| Ren et al., OrchBench, arXiv 2607.25656 | preprint | Lợi thế nhiều agent phụ thuộc áp lực ngữ cảnh (lớn ở 16k, gần 0 ở 128k). Chấm riêng kế hoạch phân công trên DAG bằng mô phỏng tất định; điểm mô phỏng tương quan r = 0,816 với chạy thật bằng Claude Code. Chỉ số: Etime = đường găng / thời gian thực; "missing transfer" (phụ thuộc không khai báo truyền thông tin); W/C (tổng công việc / đường găng). |
| Cemri et al., MAST, NeurIPS 2025 D&B | bình duyệt | 14 kiểu lỗi, 3 nhóm, κ 0,88. Tỉ trọng nhóm khác nhau giữa các phiên bản bài. |
| Xia et al., Agentless, FSE 2025 | bình duyệt | Quy trình cố định không agent tự lập kế hoạch vẫn cạnh tranh trên bài cỡ issue. |
| Anthropic (06/2025, 01/2026), Cognition (06/2025, 04/2026) | blog | Nhiều agent tốn khoảng 3–10 lần token, có ca phối hợp tốn hơn làm việc. Khuyên chia theo ngữ cảnh/module, giữ ghi một luồng. Không kiểm chứng độc lập. |

**Đọc cho CCoding:** số nội bộ cùng chiều với tài liệu.
- Token ×1,6–6,6, chất lượng chạm trần trên bài dễ: hợp với hiện tượng bão hòa.
- Bài không chia được chậm hơn 1,4–2,1 lần.
- Bỏ họp rẻ hơn khoảng 28 %.
- Tài liệu cho rằng tín hiệu chọn làn nên dựa trên **cấu trúc mã** (cụm tệp rời nhau, không chồng tệp, W/C ≥ 2), không dựa trên câu chữ của đề bài. Đây là đề xuất, cần đo (E9).

## 2. Đo chất lượng bóc tách

- **Đã có định nghĩa, dùng được:**
  - Etime và W/C (OrchBench);
  - missing transfer (OrchBench);
  - kế hoạch bỏ sót tệp then chốt: ca minitorch của CAID, cùng cấu hình mà 8,7 % so với 34,3 %, chỉ vì không giao một tệp then chốt.
- **Benchmark đánh giá riêng bóc tách:** TaskBench (NeurIPS 2024), PlanBench, MultiAgentBench (ACL 2025). Không cái nào dành riêng cho code agent.
- **Khoảng trống:** chưa thấy nghiên cứu bình duyệt nào đo độ chính xác của `dependsOn` so với phụ thuộc thật trong repo, hay độ ghép nối tệp giữa hạng mục song song.
- **CCoding đã có số tương ứng:**
  - mức song song cấu trúc kế hoạch cho phép (= W/C) và đạt được: `bench/vs-claude/results/decisions/decomp-agg.json`;
  - xung đột khi gộp, đường găng (P).

## 3. Model cho vai lập kế hoạch

| Nguồn | Loại | Điểm chính |
|---|---|---|
| OrchBench | preprint | Model mạnh hầu như không bỏ sót luồng truyền, nhưng kế hoạch bảo thủ, tốn hơn. Có ca chia quá vụn. Không model nào dẫn ở mọi quy mô. |
| TaskBench | bình duyệt | Model mạnh dẫn về bóc tách; khoảng cách tăng theo độ phức tạp. |
| CAID | preprint | Model nền yếu bóc tách kém tin cậy hơn trên bài mở. |
| RouteLLM, ICLR 2025 | bình duyệt | Định tuyến model mạnh/yếu giảm chi phí hơn 2 lần ở vài ca mà không giảm chất lượng (hỏi đáp, không phải agent). |
| Anthropic "advisor strategy" (04/2026) | blog | Sonnet thực thi, Opus chỉ được gọi khi kẹt: +2,7 điểm % trên SWE-bench Multilingual, −11,9 % chi phí (tự báo cáo). |
| Cognition (04/2026) | blog | Ghép model lập kế hoạch mạnh chỉ bù một phần nhỏ; chất lượng bị giới hạn bởi model thực thi. |

**Đọc cho CCoding:**
- Giữ Opus cho trưởng phòng ở làn đủ phòng có cơ sở, vì bỏ sót hạng mục then chốt rất đắt (ca BRIEF-20 bỏ K4).
- Làn nhanh: Sonnet lập kế hoạch kèm Opus cố vấn là giả thuyết cần đo (E9).

## 4. Nghiệm thu bằng LLM

| Nguồn | Loại | Điểm chính |
|---|---|---|
| Crupi et al., IEEE TSE 2025 | bình duyệt | GPT-4-turbo chấm Java không chạy: nhận đúng 72 % bản đúng, duyệt nhầm 50 % bản sai. |
| Jin & Chen, arXiv 2508.12358 | preprint | Chặn nhầm 22–48 % mã đúng với prompt đơn giản. Bắt "giải thích kèm sửa" làm chặn nhầm tăng mạnh; prompt "so sánh hành vi" giảm. |
| Jiang et al., CodeJudgeBench, arXiv 2507.10535 | preprint | Model có "thinking" chấm tốt hơn rõ. Bộ chấm tốt nhất đúng khoảng 82 %. Thứ tự trình bày ảnh hưởng kết quả. |
| Kim et al., TeamBench, arXiv 2605.07073 | preprint | Verifier duyệt 49 % sản phẩm trượt bộ chấm tất định. |
| Zhuge et al., Agent-as-a-Judge, ICML 2025 | bình duyệt | Agent chấm có công cụ đồng thuận với chuyên gia khoảng 90 %, so với 60–71 % của LLM-as-a-judge. |

**Đọc cho CCoding:**
- E7: Sonnet chặn nhầm 42 %, Claude Code đơn 47 %, nằm trong dải 22–48 % của Jin & Chen.
- Tài liệu ủng hộ cách: lệnh kiểm tra thật làm trọng tài, LLM chỉ chấm tiêu chí không kiểm được bằng lệnh.

**Tính nhanh của người điều phối trên dữ liệu E7 ([Khám phá], sau khi đã thấy kết quả; K4 của BRIEF-22 phải kiểm lại từ `results/e7-cto/`):**
- **Cách tính:** cascade "Sonnet chấm trước, chỉ ca Sonnet chặn mới chuyển Opus, chặn khi cả hai chặn", từ các cặp bất đồng R1 so với R2 trong `results/e7-cto/report.md` dòng 29 và 32.
- **Mục lỗi:** chỉ R2 chặn = 0, nên chặn cả hai = 55/64 (recall 85,9 %, như R2).
- **Mục đúng:** R1 chặn 27, chỉ R1 chặn 24, nên chặn cả hai = 3/64 = 4,7 %.
- **Chi phí:** Opus phải chạy trên khoảng 90/128 mục (mọi ca R1 chặn), nên tổng chi phí xấp xỉ R1 + 0,7 × R2, cao hơn R2 đơn.
- **Kết luận:** trên bộ này, cascade không rẻ hơn Opus đơn, chỉ bớt 1 ca chặn nhầm.
- **Lưu ý:** R2 có 13 lượt không đọc được kết luận do chạm trần lượt. Recall của Opus có thể khác khi nâng trần lượt.

## 5. Gợi ý thí nghiệm (cho K4)

- Ghép cặp cùng đề: làn đơn so với làn song song.
- Chỉ số chính: pass của lệnh kiểm tra thật sau gộp, thời gian thực, token, và "regret chia việc" (chi phí của làn đã chọn trừ làn tốt hơn).
- Chỉ số bóc tách:
  - Etime, W/C dự kiến so với thực tế;
  - tỉ lệ hạng mục chồng tệp;
  - precision/recall của `dependsOn`;
  - làm lại, xung đột, yêu cầu bị bỏ sót.
- Ước tính cỡ mẫu của báo cáo (tự tính, cần kiểm lại):
  - nhị phân ghép cặp, 30 % cặp bất đồng, chênh 15 điểm %: khoảng 105 cặp;
  - log tỉ số thời gian, SD 0,5, chênh 15 %: khoảng 90 cặp.
- Bộ chấm kế hoạch rẻ kiểu OrchBench (mô phỏng tất định trên DAG và đồ thị import) để so planner Opus với Sonnet mà không tốn token thực thi.

## Nguồn

- CAID: https://arxiv.org/pdf/2603.21489
- Kim et al. v3: https://arxiv.org/html/2512.08296v3
- CooperBench: https://www.arxiv.org/abs/2601.13295 ; https://cooperbench.com/
- Tran & Kiela: https://www.emergentmind.com/papers/2604.02460
- OrchBench: https://arxiv.org/pdf/2607.25656
- TeamBench: https://arxiv.org/abs/2605.07073
- MAST (NeurIPS 2025): https://papers.nips.cc/paper_files/paper/2025/hash/b1041e52d3be19f0a9bc491657488e4a-Abstract-Datasets_and_Benchmarks_Track.html
- MultiAgentBench (ACL 2025): https://aclanthology.org/2025.acl-long.421/
- Agentless (FSE 2025): https://dl.acm.org/doi/10.1145/3715754
- TaskBench (NeurIPS 2024): https://proceedings.neurips.cc/paper_files/paper/2024/file/085185ea97db31ae6dcac7497616fd3e-Paper-Datasets_and_Benchmarks_Track.pdf
- CodeJudgeBench: https://arxiv.org/abs/2507.10535
- Jin & Chen: https://arxiv.org/html/2508.12358v1
- Anthropic, Building multi-agent systems (01/2026): https://claude.com/resources/articles/building-multi-agent-systems-when-and-how-to-use-them
- Anthropic, The advisor strategy (04/2026): https://claude.com/blog/the-advisor-strategy
- Cognition, Multi-Agents: What's Actually Working (04/2026): https://cognition.com/blog/multi-agents-working
