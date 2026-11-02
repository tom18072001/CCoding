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
