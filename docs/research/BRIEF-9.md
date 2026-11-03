# Đề bài vòng 4, gói 3, cho Phòng Nghiên cứu: kiểm tài liệu "4 hướng tăng tốc" bằng dữ liệu benchmark, đưa vào backlog B-13…

Gói nhỏ: **2 hạng mục + review, ngân sách 5M token**. Không sửa `src/` hay `bench/`. Phân loại dữ liệu: **Nội bộ**.
**Kỷ luật ngân sách:** gói 2 dùng 18,6M so với 4M (×4,7). Gói này đọc tệp theo đoạn (Read có offset/Grep), không đọc lại nguyên tệp lớn, và không chạy lại script nặng khi không cần.

## Đầu vào
- `docs/research/context/acceleration-4-directions-2026-11-03.md`: tài liệu giám đốc gửi ngày 3/11.
  - Bốn hướng: số lượt gọi, chạy song song, cache prompt, chọn model theo pha.
  - Tám đề xuất cải tiến.
  - Tài liệu phân tích **`main` tại `9e6079b`**, dựa trên **1 nhiệm vụ chạy thật** (5 lượt gọi) và 3 nhiệm vụ runtime mô phỏng. Tài liệu tự ghi là chưa đủ để chốt con số.
- **Dữ liệu của ta:**
  - ảnh chụp 276 dòng (`git show 838a5f1:bench/vs-claude/results/study-cloud/runs.jsonl`);
  - `analysis/b7-cost-decomposition.md` (T-1…T-7);
  - `analysis/agreement.md`;
  - `analysis/variance-decomposition.md`;
  - `improvement-backlog.md` (B-01…B-12).
- **Không đọc** các dòng `study-cloud` sau ảnh chụp, cũng như `results/b7prime`, vì nghiên cứu đang chạy.

## Hạng mục

**K1 — research-lead (data-scientist tính số): đối chiếu 8 đề xuất với bằng chứng, xếp vào backlog**
1. **Mỗi đề xuất ghi một dòng:**
   - đã có trên nhánh `perf/vs-claude-loop` hay chưa. Ví dụ: làn đơn B-01 đã bỏ định tuyến, kế hoạch, họp và tổng hợp (chuỗi pha B7 là `execute → accept`); B-11 có promptDiet và nghiệm thu brief;
   - bằng chứng của ta ủng hộ hay mâu thuẫn, kèm tệp và bảng;
   - mã backlog mới **B-13…** nếu cần làm. Đề xuất đã có thì ghi "đã có — B-xx".
2. **Chỗ cần đối chiếu kỹ:**
   - **Cache.** Tài liệu ghi ghi cache chiếm khoảng 68 % chi phí (1 nhiệm vụ). T-4 của ta cho phần chênh B7 − A0 trên t1–t5: out 50,4 %, cacheWrite 36,8 %, cacheRead 12,8 %. Tính thêm trên ảnh chụp tỉ lệ chi phí từng thành phần và **tỉ lệ trúng cache** `cacheRead / (cacheRead + cacheWrite + input)` cho mỗi arm (gộp bài, mô tả). Lý giải chênh lệch với 68 %.
   - **Họp.** Arm `B1` (`discussionRounds: 0`) đã có trong `arms.json` nhưng chưa chạy. Họp chỉ xảy ra ở làn đầy đủ với kế hoạch > 2 hạng mục, nên đo phải dùng bài lớn. `l1-modules` và `l2-chain` chưa có `task.json`. Ghi điều kiện này.
   - **Model theo pha.** Tài liệu đề xuất CTO dùng Opus. Đối chiếu với accept chiếm 47,7 % phần chênh (T-4) và B-11 (a-brief). Ghi phương án ghép "CTO Opus + nghiệm thu brief". Cách đo dùng B-12 (bài cài lỗi, đo tỉ lệ nghiệm thu sai).
3. **Độ nhạy của token có trọng số.** Công thức của giám đốc là `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`, và **vẫn là thước đo chính**. Theo bảng giá hiện hành, đọc cache của Sonnet 5.5 và Opus 5.5 chỉ tốn 0,05× giá đầu vào. Tính lại B7/A0 (T-7) và B6/A0 với hệ số 0,05, cùng chi phí USD theo bảng giá model thật. Ghi thành phân tích phụ, ngoài họ Holm, kèm một dòng §9 trong `preregistration.md`.
4. **Ba đề xuất đầu cho Phòng Dev**, mỗi đề xuất có tiêu chí xong và cách đo. Bắt buộc có **phép chẩn đoán cache của claude-cli** (đề xuất 2 của tài liệu):
   - Đặc tả đúng lệnh `claude -p` mà runtime của CCoding gọi, đọc từ `src/` (`--allowedTools`, `cwd`, lời nhắc hệ thống).
   - Ba cặp gọi giống hệt nhau, mỗi cặp chỉ khác một yếu tố: giống hết, khác bộ công cụ, khác thư mục làm việc. Tối đa 8 lượt gọi.
   - Đo cacheWrite và cacheRead của lượt thứ hai.
   - Chỉ đặc tả, Phòng Dev chạy.

**K2 — literature-researcher: kiểm nguồn mới của tài liệu, thêm vào `related-work.md`**
- Debate or Vote (Choi, Zhu, Li, 2025; arXiv 2508.17536).
- RouteLLM (Ong et al., 2024; arXiv 2406.18665).
- LLMCompiler (Kim et al., 2024; arXiv 2312.04511).
- Tài liệu prompt caching của Anthropic: thứ tự tiền tố, ngưỡng 512 token, hệ số giá theo model.
- Thống nhất URL bài Cognition (`cognition.com` hay `cognition.ai`).
- Mỗi số trích phải kèm mục hoặc bảng của nguồn.
- Kiểm các câu tài liệu gán cho MAST:
  - "khoảng 23 % lỗi ở khâu kiểm chứng";
  - "người chốt cuối giúp ChatDev +9,4 %". Bản v3 của MAST gán con số này lúc cho đặc tả vai trò, lúc cho người chốt cuối. Ghi rõ chỗ không nhất quán.

**K3 — peer-reviewer: review K1, K2**
- Mỗi dòng của bảng 8 đề xuất có truy được về tệp hoặc bảng không?
- Phân tích độ nhạy có giữ công thức của giám đốc làm thước đo chính không?
- Có đọc dữ liệu sau ảnh chụp không?
- Kiểm bằng kết quả "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không sửa paper hay slide.
- Không đưa đề xuất lên `main`. Việc đó do giám đốc quyết.
