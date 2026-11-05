# Kết quả benchtest CCoding vs Claude Code thuần

Sinh tự động bởi `harness/export.py` — số trung bình theo lượt; thời gian = từ lúc bắt đầu tới lúc xong (giây);
chi phí = giá niêm yết quy đổi do Claude Code báo (gói Max không trả theo token); token = trung bình mỗi lượt.

## C1 — cloud 1/11 tối · CCoding gốc (14e2ec6) · chạy theo cặp

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | claude | 2 | 99.66% | 1/2 | 132 (129–135) s | $0.51 | 14k | 227k | 23k |
| t1-duration | ccoding | 2 | 100.0% | 2/2 | 330 (314–346) s | $1.14 | 34k | 612k | 130k |
| t2-orders | claude | 2 | 100.0% | 2/2 | 94 (86–101) s | $0.42 | 10k | 273k | 21k |
| t2-orders | ccoding | 2 | 100.0% | 2/2 | 142 (139–146) s | $0.78 | 22k | 528k | 79k |
| t3-api | claude | 2 | 100.0% | 2/2 | 212 (197–226) s | $0.87 | 21k | 765k | 37k |
| t3-api | ccoding | 2 | 100.0% | 2/2 | 446 (412–479) s | $1.81 | 64k | 1406k | 189k |
| t4-perf | claude | 2 | 100.0% | 2/2 | 250 (171–328) s | $0.72 | 19k | 550k | 30k |
| t4-perf | ccoding | 2 | 100.0% | 2/2 | 446 (323–569) s | $1.23 | 42k | 808k | 130k |

## C2 — cloud 2/11 sáng · bài 5 (CCoding gốc + Claude) và biến thể fast/sonlead 1/11 trước khi chạm hạn mức

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | ccoding-fast | 1 | 100.0% | 1/1 | 265 (265–265) s | $0.60 | 23k | 334k | 54k |
| t1-duration | ccoding-sonlead | 1 | 100.0% | 1/1 | 266 (266–266) s | $0.48 | 22k | 282k | 58k |
| t5-logq | claude | 2 | 100.0% | 2/2 | 244 (244–245) s | $1.00 | 27k | 637k | 41k |
| t5-logq | ccoding | 2 | 100.0% | 2/2 | 413 (405–421) s | $2.08 | 74k | 1335k | 249k |

## C3 — cloud 2/11 · CCoding cải tiến bước 1 (họp song song, 1 hạng mục cho việc nhỏ, tổng hợp Sonnet)

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | ccoding-new | 1 | 100.0% | 1/1 | 258 (258–258) s | $0.77 | 30k | 654k | 75k |
| t2-orders | ccoding-new | 1 | 100.0% | 1/1 | 121 (121–121) s | $0.84 | 17k | 320k | 118k |

## C4 — cloud 2/11 · làn nhanh lần 1 — 2 nhiệm vụ CCoding cùng lúc (tranh agent, số đo thời gian nhiễu)

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | ccoding-fastlane | 1 | 100.0% | 1/1 | 170 (170–170) s | $0.81 | 37k | 485k | 95k |
| t2-orders | ccoding-fastlane | 1 | 98.33% | 0/1 | 127 (127–127) s | $0.55 | 19k | 527k | 75k |
| t3-api | ccoding-fastlane | 1 | 100.0% | 1/1 | 247 (247–247) s | $1.40 | 54k | 1579k | 175k |
| t4-perf | ccoding-fastlane | 1 | 100.0% | 1/1 | 124 (124–124) s | $0.55 | 21k | 621k | 69k |
| t5-logq | ccoding-fastlane | 1 | 100.0% | 1/1 | 307 (307–307) s | $1.15 | 50k | 1247k | 130k |

## C5 — cloud 2/11 · làn nhanh + điều phối song song (+ hook stdin từ giữa vòng) vs Claude, mỗi hệ tuần tự · t3 lượt 1 của CCoding bị lỗi treo stdin (579 s)

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | claude | 2 | 99.66% | 1/2 | 126 (117–134) s | $0.51 | 13k | 285k | 23k |
| t1-duration | ccoding-fastlane | 2 | 100.0% | 2/2 | 107 (98–116) s | $0.54 | 22k | 361k | 69k |
| t2-orders | claude | 2 | 100.0% | 2/2 | 91 (89–93) s | $0.44 | 10k | 272k | 24k |
| t2-orders | ccoding-fastlane | 2 | 100.0% | 2/2 | 106 (78–134) s | $0.69 | 24k | 717k | 94k |
| t3-api | claude | 2 | 100.0% | 2/2 | 158 (155–160) s | $0.71 | 18k | 385k | 33k |
| t3-api | ccoding-fastlane | 2 | 100.0% | 2/2 | 400 (221–579) s | $1.14 | 42k | 1090k | 129k |
| t4-perf | claude | 2 | 100.0% | 2/2 | 202 (186–219) s | $0.63 | 16k | 446k | 26k |
| t4-perf | ccoding-fastlane | 2 | 100.0% | 2/2 | 153 (134–172) s | $0.57 | 22k | 556k | 73k |
| t5-logq | claude | 2 | 100.0% | 2/2 | 258 (247–270) s | $1.01 | 29k | 529k | 41k |
| t5-logq | ccoding-fastlane | 2 | 100.0% | 2/2 | 174 (161–188) s | $1.08 | 47k | 949k | 126k |

## C6 — cloud 2/11 · kiểm chứng d7600f6: làn nhanh chạy cùng lúc tối đa 4 hạng mục độc lập (t3, t5)

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t3-api | claude | 2 | 100.0% | 2/2 | 252 (246–258) s | $1.04 | 25k | 1080k | 42k |
| t3-api | ccoding-fastlane | 2 | 100.0% | 2/2 | 192 (173–211) s | $1.10 | 46k | 1124k | 130k |
| t5-logq | claude | 2 | 100.0% | 2/2 | 260 (236–283) s | $1.01 | 29k | 537k | 41k |
| t5-logq | ccoding-fastlane | 2 | 100.0% | 2/2 | 174 (134–214) s | $1.22 | 51k | 1066k | 149k |

## C7 — cloud 2/11 · tách hiệu ứng mô hình: Claude Code một mình bằng Sonnet (claude-sonnet) cùng lúc với làn nhanh (thành viên Sonnet)

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | ccoding-fastlane | 1 | 100.0% | 1/1 | 109 (109–109) s | $0.40 | 16k | 230k | 52k |
| t1-duration | claude-sonnet | 2 | 100.0% | 2/2 | 66 (62–69) s | $0.20 | 9k | 253k | 20k |
| t2-orders | ccoding-fastlane | 1 | 86.67% | 0/1 | 71 (71–71) s | $0.40 | 13k | 388k | 56k |
| t2-orders | claude-sonnet | 2 | 100.0% | 2/2 | 42 (41–42) s | $0.16 | 6k | 268k | 18k |
| t3-api | ccoding-fastlane | 1 | 100.0% | 1/1 | 192 (192–192) s | $1.13 | 48k | 1340k | 126k |
| t3-api | claude-sonnet | 2 | 100.0% | 2/2 | 108 (100–115) s | $0.34 | 17k | 450k | 32k |
| t4-perf | ccoding-fastlane | 1 | 100.0% | 1/1 | 120 (120–120) s | $0.53 | 21k | 445k | 69k |
| t4-perf | claude-sonnet | 2 | 100.0% | 2/2 | 49 (45–53) s | $0.15 | 6k | 215k | 17k |
| t5-logq | ccoding-fastlane | 1 | 100.0% | 1/1 | 127 (127–127) s | $1.04 | 46k | 850k | 122k |
| t5-logq | claude-sonnet | 2 | 100.0% | 2/2 | 166 (159–172) s | $0.44 | 25k | 433k | 37k |

## C8 — cloud 2/11 · kiểm chứng c55a249 (hạng mục sửa mã giao nhầm cho reviewer; lỗi review nhãn lạ vào vòng sửa) trên t2

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t2-orders | ccoding-fastlane | 3 | 100.0% | 3/3 | 129 (102–166) s | $0.79 | 23k | 684k | 122k |

## C9 — 

| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| t1-duration | ccoding-fastlane | 3 | 99.78% | 2/3 | 184 (104–256) s | $0.77 | 29k | 678k | 100k |
| t1-duration | claude-sonnet | 6 | 100.0% | 6/6 | 67 (57–76) s | $0.19 | 9k | 216k | 19k |
| t2-orders | ccoding-fastlane | 3 | 100.0% | 3/3 | 147 (111–177) s | $0.83 | 28k | 865k | 115k |
| t2-orders | claude-sonnet | 5 | 100.0% | 5/5 | 48 (38–60) s | $0.15 | 6k | 219k | 18k |
| t3-api | ccoding-fastlane | 3 | 100.0% | 3/3 | 238 (156–333) s | $1.18 | 47k | 1224k | 143k |
| t3-api | claude-sonnet | 5 | 100.0% | 5/5 | 112 (89–136) s | $0.31 | 14k | 525k | 29k |
| t4-perf | ccoding-fastlane | 2 | 100.0% | 2/2 | 134 (126–143) s | $0.57 | 23k | 471k | 71k |
| t4-perf | claude-sonnet | 5 | 100.0% | 5/5 | 70 (58–81) s | $0.16 | 7k | 175k | 17k |
| t5-logq | ccoding-fastlane | 2 | 82.53% | 1/2 | 161 (145–177) s | $0.92 | 41k | 746k | 107k |
| t5-logq | claude-sonnet | 5 | 100.0% | 5/5 | 164 (133–187) s | $0.41 | 24k | 355k | 35k |

## Từng lượt

| Vòng | Bài | Hệ | Lượt | Trạng thái | Thời gian | Chi phí | Test ẩn | perf (ms) | Nhiệm vụ CCoding |
|---|---|---|--:|---|--:|--:|--:|--:|---|
| C1 | t1-duration | ccoding | 1 | done | 314 s | $1.41 | 149/149 |  | T-20261101-175907-15e |
| C1 | t1-duration | ccoding | 2 | done | 346 s | $0.87 | 149/149 |  | T-20261101-181550-b39 |
| C1 | t1-duration | claude | 1 | done | 135 s | $0.53 | 149/149 |  |  |
| C1 | t1-duration | claude | 2 | done | 129 s | $0.49 | 148/149 |  |  |
| C1 | t2-orders | ccoding | 1 | done | 146 s | $0.77 | 60/60 |  | T-20261101-180305-edc |
| C1 | t2-orders | ccoding | 2 | done | 139 s | $0.79 | 60/60 |  | T-20261101-182144-be5 |
| C1 | t2-orders | claude | 1 | done | 101 s | $0.46 | 60/60 |  |  |
| C1 | t2-orders | claude | 2 | done | 86 s | $0.38 | 60/60 |  |  |
| C1 | t3-api | ccoding | 1 | done | 479 s | $2.13 | 87/87 |  | T-20261101-180536-5f2 |
| C1 | t3-api | ccoding | 2 | done | 412 s | $1.49 | 87/87 |  | T-20261101-182415-b19 |
| C1 | t3-api | claude | 1 | done | 197 s | $0.81 | 87/87 |  |  |
| C1 | t3-api | claude | 2 | done | 226 s | $0.94 | 87/87 |  |  |
| C1 | t4-perf | ccoding | 1 | done | 569 s | $1.44 | 19/19 | 544 | T-20261101-181038-41e |
| C1 | t4-perf | ccoding | 2 | done | 323 s | $1.03 | 19/19 | 187 | T-20261101-183121-69b |
| C1 | t4-perf | claude | 1 | done | 171 s | $0.57 | 19/19 | 162 |  |
| C1 | t4-perf | claude | 2 | done | 328 s | $0.88 | 19/19 | 185 |  |
| C2 | t1-duration | ccoding-fast | 1 | done | 265 s | $0.60 | 149/149 |  | T-20261101-183754-332 |
| C2 | t1-duration | ccoding-sonlead | 1 | done | 266 s | $0.48 | 149/149 |  | T-20261101-183754-7c1 |
| C2 | t5-logq | ccoding | 1 | done | 421 s | $2.26 | 146/146 |  | T-20261102-102259-8b5 |
| C2 | t5-logq | ccoding | 2 | done | 405 s | $1.89 | 146/146 |  | T-20261102-103016-309 |
| C2 | t5-logq | claude | 1 | done | 244 s | $1.00 | 146/146 |  |  |
| C2 | t5-logq | claude | 2 | done | 245 s | $1.01 | 146/146 |  |  |
| C3 | t1-duration | ccoding-new | 1 | done | 258 s | $0.77 | 149/149 |  | T-20261102-102259-a08 |
| C3 | t2-orders | ccoding-new | 1 | done | 121 s | $0.84 | 60/60 |  | T-20261102-102259-f4b |
| C4 | t1-duration | ccoding-fastlane | 1 | done | 170 s | $0.81 | 149/149 |  | T-20261102-103531-c98 |
| C4 | t2-orders | ccoding-fastlane | 1 | done | 127 s | $0.55 | 59/60 |  | T-20261102-103633-f1d |
| C4 | t3-api | ccoding-fastlane | 1 | done | 247 s | $1.40 | 87/87 |  | T-20261102-103114-68f |
| C4 | t4-perf | ccoding-fastlane | 1 | done | 124 s | $0.55 | 19/19 | 272 | T-20261102-103833-d71 |
| C4 | t5-logq | ccoding-fastlane | 1 | done | 307 s | $1.15 | 146/146 |  | T-20261102-103114-c63 |
| C5 | t1-duration | ccoding-fastlane | 1 | done | 116 s | $0.39 | 149/149 |  | T-20261102-104814-23a |
| C5 | t1-duration | ccoding-fastlane | 2 | done | 98 s | $0.69 | 149/149 |  | T-20261102-110841-eff |
| C5 | t1-duration | claude | 1 | done | 117 s | $0.47 | 148/149 |  |  |
| C5 | t1-duration | claude | 2 | done | 134 s | $0.56 | 149/149 |  |  |
| C5 | t2-orders | ccoding-fastlane | 1 | done | 134 s | $0.82 | 60/60 |  | T-20261102-105015-e80 |
| C5 | t2-orders | ccoding-fastlane | 2 | done | 78 s | $0.56 | 60/60 |  | T-20261102-111027-b00 |
| C5 | t2-orders | claude | 1 | done | 93 s | $0.46 | 60/60 |  |  |
| C5 | t2-orders | claude | 2 | done | 89 s | $0.41 | 60/60 |  |  |
| C5 | t3-api | ccoding-fastlane | 1 | done | 579 s | $1.08 | 87/87 |  | T-20261102-105231-9e5 |
| C5 | t3-api | ccoding-fastlane | 2 | done | 221 s | $1.20 | 87/87 |  | T-20261102-111158-10a |
| C5 | t3-api | claude | 1 | done | 155 s | $0.71 | 87/87 |  |  |
| C5 | t3-api | claude | 2 | done | 160 s | $0.72 | 87/87 |  |  |
| C5 | t4-perf | ccoding-fastlane | 1 | done | 172 s | $0.59 | 19/19 | 298 | T-20261102-110218-6f9 |
| C5 | t4-perf | ccoding-fastlane | 2 | done | 134 s | $0.56 | 19/19 | 310 | T-20261102-111544-1fa |
| C5 | t4-perf | claude | 1 | done | 186 s | $0.60 | 19/19 | 141 |  |
| C5 | t4-perf | claude | 2 | done | 219 s | $0.65 | 19/19 | 249 |  |
| C5 | t5-logq | ccoding-fastlane | 1 | done | 188 s | $1.17 | 146/146 |  | T-20261102-110524-5ed |
| C5 | t5-logq | ccoding-fastlane | 2 | done | 161 s | $0.98 | 146/146 |  | T-20261102-111805-c7b |
| C5 | t5-logq | claude | 1 | done | 247 s | $0.97 | 146/146 |  |  |
| C5 | t5-logq | claude | 2 | done | 270 s | $1.06 | 146/146 |  |  |
| C6 | t3-api | ccoding-fastlane | 1 | done | 211 s | $1.26 | 87/87 |  | T-20261102-112212-a80 |
| C6 | t3-api | ccoding-fastlane | 2 | done | 173 s | $0.95 | 87/87 |  | T-20261102-112816-f3d |
| C6 | t3-api | claude | 1 | done | 246 s | $0.98 | 87/87 |  |  |
| C6 | t3-api | claude | 2 | done | 258 s | $1.10 | 87/87 |  |  |
| C6 | t5-logq | ccoding-fastlane | 1 | done | 134 s | $1.08 | 146/146 |  | T-20261102-112559-a65 |
| C6 | t5-logq | ccoding-fastlane | 2 | done | 214 s | $1.36 | 146/146 |  | T-20261102-113118-0ed |
| C6 | t5-logq | claude | 1 | done | 283 s | $1.10 | 146/146 |  |  |
| C6 | t5-logq | claude | 2 | done | 236 s | $0.92 | 146/146 |  |  |
| C7 | t1-duration | ccoding-fastlane | 1 | done | 109 s | $0.40 | 149/149 |  | T-20261102-114744-d33 |
| C7 | t1-duration | claude-sonnet | 1 | done | 69 s | $0.22 | 149/149 |  |  |
| C7 | t1-duration | claude-sonnet | 2 | done | 62 s | $0.18 | 149/149 |  |  |
| C7 | t2-orders | ccoding-fastlane | 1 | done | 71 s | $0.40 | 52/60 |  | T-20261102-114945-ee8 |
| C7 | t2-orders | claude-sonnet | 1 | done | 41 s | $0.16 | 60/60 |  |  |
| C7 | t2-orders | claude-sonnet | 2 | done | 42 s | $0.16 | 60/60 |  |  |
| C7 | t3-api | ccoding-fastlane | 1 | done | 192 s | $1.13 | 87/87 |  | T-20261102-115100-2f5 |
| C7 | t3-api | claude-sonnet | 1 | done | 100 s | $0.33 | 87/87 |  |  |
| C7 | t3-api | claude-sonnet | 2 | done | 115 s | $0.36 | 87/87 |  |  |
| C7 | t4-perf | ccoding-fastlane | 1 | done | 120 s | $0.53 | 19/19 | 288 | T-20261102-115417-69f |
| C7 | t4-perf | claude-sonnet | 1 | done | 45 s | $0.14 | 19/19 | 176 |  |
| C7 | t4-perf | claude-sonnet | 2 | done | 53 s | $0.16 | 19/19 | 308 |  |
| C7 | t5-logq | ccoding-fastlane | 1 | done | 127 s | $1.04 | 146/146 |  | T-20261102-115622-a41 |
| C7 | t5-logq | claude-sonnet | 1 | done | 172 s | $0.45 | 146/146 |  |  |
| C7 | t5-logq | claude-sonnet | 2 | done | 159 s | $0.43 | 146/146 |  |  |
| C8 | t2-orders | ccoding-fastlane | 1 | done | 166 s | $1.22 | 60/60 |  | T-20261102-130250-6be |
| C8 | t2-orders | ccoding-fastlane | 2 | done | 102 s | $0.55 | 60/60 |  | T-20261102-130551-d47 |
| C8 | t2-orders | ccoding-fastlane | 3 | done | 120 s | $0.61 | 60/60 |  | T-20261102-130736-d0a |
| C9 | t1-duration | ccoding-fastlane | 1 | done | 104 s | $0.52 | 149/149 |  | T-20261102-133429-a8b |
| C9 | t1-duration | ccoding-fastlane | 2 | done | 191 s | $0.95 | 149/149 |  | T-20261102-134940-9cb |
| C9 | t1-duration | ccoding-fastlane | 3 | done | 256 s | $0.83 | 148/149 |  | T-20261102-140320-3a1 |
| C9 | t1-duration | claude-sonnet | 1 | done | 57 s | $0.17 | 149/149 |  |  |
| C9 | t1-duration | claude-sonnet | 2 | done | 65 s | $0.19 | 149/149 |  |  |
| C9 | t1-duration | claude-sonnet | 3 | done | 65 s | $0.18 | 149/149 |  |  |
| C9 | t1-duration | claude-sonnet | 4 | done | 65 s | $0.20 | 149/149 |  |  |
| C9 | t1-duration | claude-sonnet | 5 | done | 74 s | $0.18 | 149/149 |  |  |
| C9 | t1-duration | claude-sonnet | 6 | done | 76 s | $0.20 | 149/149 |  |  |
| C9 | t2-orders | ccoding-fastlane | 1 | done | 153 s | $0.97 | 60/60 |  | T-20261102-133615-700 |
| C9 | t2-orders | ccoding-fastlane | 2 | done | 111 s | $0.77 | 60/60 |  | T-20261102-135256-229 |
| C9 | t2-orders | ccoding-fastlane | 3 | done | 177 s | $0.75 | 60/60 |  | T-20261102-140751-cd2 |
| C9 | t2-orders | claude-sonnet | 1 | done | 42 s | $0.14 | 60/60 |  |  |
| C9 | t2-orders | claude-sonnet | 2 | done | 60 s | $0.17 | 60/60 |  |  |
| C9 | t2-orders | claude-sonnet | 3 | done | 38 s | $0.14 | 60/60 |  |  |
| C9 | t2-orders | claude-sonnet | 4 | done | 43 s | $0.15 | 60/60 |  |  |
| C9 | t2-orders | claude-sonnet | 5 | done | 55 s | $0.15 | 60/60 |  |  |
| C9 | t3-api | ccoding-fastlane | 1 | done | 333 s | $1.48 | 87/87 |  | T-20261102-133901-471 |
| C9 | t3-api | ccoding-fastlane | 2 | done | 156 s | $0.91 | 87/87 |  | T-20261102-135457-2d5 |
| C9 | t3-api | ccoding-fastlane | 3 | done | 226 s | $1.14 | 87/87 |  | T-20261102-141052-c72 |
| C9 | t3-api | claude-sonnet | 1 | done | 104 s | $0.32 | 87/87 |  |  |
| C9 | t3-api | claude-sonnet | 2 | done | 124 s | $0.30 | 87/87 |  |  |
| C9 | t3-api | claude-sonnet | 3 | done | 105 s | $0.33 | 87/87 |  |  |
| C9 | t3-api | claude-sonnet | 4 | done | 89 s | $0.27 | 87/87 |  |  |
| C9 | t3-api | claude-sonnet | 5 | done | 136 s | $0.34 | 87/87 |  |  |
| C9 | t4-perf | ccoding-fastlane | 1 | done | 126 s | $0.50 | 19/19 | 317 | T-20261102-134447-258 |
| C9 | t4-perf | ccoding-fastlane | 2 | done | 143 s | $0.64 | 19/19 | 325 | T-20261102-135744-09f |
| C9 | t4-perf | claude-sonnet | 1 | done | 71 s | $0.16 | 19/19 | 487 |  |
| C9 | t4-perf | claude-sonnet | 2 | done | 81 s | $0.17 | 19/19 | 128 |  |
| C9 | t4-perf | claude-sonnet | 3 | done | 68 s | $0.16 | 19/19 | 167 |  |
| C9 | t4-perf | claude-sonnet | 4 | done | 71 s | $0.15 | 19/19 | 158 |  |
| C9 | t4-perf | claude-sonnet | 5 | done | 58 s | $0.15 | 19/19 | 150 |  |
| C9 | t5-logq | ccoding-fastlane | 1 | done | 145 s | $1.12 | 146/146 |  | T-20261102-134708-672 |
| C9 | t5-logq | ccoding-fastlane | 2 | done | 177 s | $0.72 | 95/146 |  | T-20261102-140019-8c2 |
| C9 | t5-logq | claude-sonnet | 1 | done | 158 s | $0.41 | 146/146 |  |  |
| C9 | t5-logq | claude-sonnet | 2 | done | 187 s | $0.46 | 146/146 |  |  |
| C9 | t5-logq | claude-sonnet | 3 | done | 165 s | $0.40 | 146/146 |  |  |
| C9 | t5-logq | claude-sonnet | 4 | done | 133 s | $0.35 | 146/146 |  |  |
| C9 | t5-logq | claude-sonnet | 5 | done | 177 s | $0.44 | 146/146 |  |  |
