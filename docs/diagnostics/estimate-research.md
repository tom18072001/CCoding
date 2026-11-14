# Kiểm hệ số ước lượng `estimatePlan` cho Nghiên cứu (D18c K4)

Nhãn dữ liệu: **Nội bộ**. Chỉ đọc số liệu; không chạy benchmark, không gọi LLM.

## Phương pháp
- Ước lượng: `Orchestrator.estimatePlanDetail()` với cấu hình mặc định (`base` 150k, `perReview` 120k, `perSubtask` none/read/write/exec = 60k/120k/200k/300k, `web` 100k), **tắt lịch sử** (`historyDays = 0`) để chỉ đo hằng số. Review bật, `maxRevisions = 1` (mặc định của nhiệm vụ). Kế hoạch lấy từ `test/fixtures/brief-item/*.json`; người nhận lấy từ roster thật của `agents/`.
- Token thật: tìm trong `bench/vs-claude/results/decisions/kpi-office.json` và `PROJECT-HISTORY.md`. `kpi-office.json` chỉ có tổng theo phòng/agent (Nghiên cứu 49.235.709 token / 53 lượt cho cả 7 nhiệm vụ, không tách theo BRIEF); `PROJECT-HISTORY.md` không ghi token theo nhiệm vụ, và không có BRIEF-20/22/22b/23. Không có `calls.jsonl` từng nhiệm vụ trong repo.

## Bảng

| BRIEF | Số hạng mục | Ước lượng (token, có review) | Ước lượng (không review) | Thật | Tỉ lệ thật/ước |
|---|---|---|---|---|---|
| BRIEF-20 | 6 | 2.190.000 | 1.950.000 | chưa đối chiếu được | — |
| BRIEF-22 (dựng tay, không phải kế hoạch thật) | 7 | 2.410.000 | 2.170.000 | chưa đối chiếu được | — |
| BRIEF-22b (lần đầu) | 6 | 2.190.000 | 1.950.000 | chưa đối chiếu được | — |
| BRIEF-23 | 5 | 1.890.000 | 1.650.000 | chưa đối chiếu được | — |
| D18b vòng bổ sung (Phát triển) | 2 | 890.000 | 650.000 | chưa đối chiếu được | — |

Ghi chú: các hạng mục Nghiên cứu đều được tính ở mức `exec` (300k/hạng mục) vì agent nghiên cứu có `run_command`; đây là nguồn chính của số ước lượng lớn.

## Kết luận
- **Chưa đối chiếu được** ước lượng với token thật của BRIEF-20/22/22b/23: nguồn chỉ đọc không có số theo nhiệm vụ. Không suy số.
- Điều kiện chỉnh hệ số (ước lượng thấp hơn thật quá 1,5 lần ở đa số ca) **không kiểm chứng được**, nên **không đổi hệ số** và không thêm test ước lượng. Số hạng mục × hằng số cho ra mức 1,65–2,41M, cùng bậc với trung bình Nghiên cứu (~0,93M token/lượt × vài lượt/hạng mục không tách được) nên chưa có bằng chứng ước lượng thấp.
- Đề xuất: lần chạy Nghiên cứu tiếp theo, trích `usage.total` của `task.json` theo mã BRIEF vào bảng này (cột "Thật") rồi mới quyết định hệ số. Khi đủ lịch sử (≥ `minSamples`) ước lượng đã tự dùng trung vị thật theo agent, nên hằng số chỉ ảnh hưởng nhiệm vụ đầu tiên.
