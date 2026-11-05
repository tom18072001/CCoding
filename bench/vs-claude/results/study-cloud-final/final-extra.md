# Bảng cuối W1–W5 (sinh bởi `final-extra.mjs`; không sửa tay)

Dòng giữ (bỏ `infra`, leak): 440. R13, lượt r1–3. Tỉ số = mũ của TB theo bài log(TB arm / TB A0-sonnet); CI 90 % bootstrap hai tầng, hạt 20261102, B = 4000 (`bootstrapRatio` của `prereg-tests.mjs`). **Mô tả, khác cửa sổ** (A0-sonnet: W1/W2a; B5, B6: W3; A1: W4–W5; A2: W5; B7: B7b). B0/A0-sonnet cùng cửa sổ.

| Arm | Server | Bài | Token ×A0 (CI 90 %) | Thời gian ×A0 (CI 90 %) | Điểm TB (13 bài) | A0-sonnet điểm TB |
| --- | --- | ---: | --- | --- | ---: | ---: |
| B0 | main e0bd2f4 | 13 | ×6,58 [5,67; 7,70] | ×9,76 [7,93; 12,19] | 1,000 | 0,979 |
| B5 | main e0bd2f4 | 13 | ×1,61 [1,41; 1,87] | ×2,59 [2,15; 3,15] | 0,984 | 0,979 |
| B6 | nhánh 7fb18ba | 13 | ×4,23 [3,59; 5,05] | ×6,29 [5,00; 8,05] | 0,996 | 0,979 |
| B7 | nhánh 7fb18ba | 13 | ×2,61 [2,13; 3,23] | ×3,96 [3,11; 5,23] | 1,000 | 0,979 |
| A1 | — | 13 | ×0,96 [0,83; 1,10] | ×1,28 [1,14; 1,44] | 0,993 | 0,979 |
| A2 | — | 13 | ×2,23 [1,94; 2,60] | ×2,55 [2,30; 2,88] | 0,995 | 0,979 |

## Bài có điểm dưới trần (TB < 0,99 ở ít nhất một arm, r1–3)

| Bài | A0-sonnet | B0 | B5 | B6 | B7 | A1 | A2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| c3-shop-bugs | 1,000 | 1,000 | 0,944 | 0,944 | 1,000 | 0,944 | 1,000 |
| l1-oncall | 0,889 | 1,000 | 0,889 | 1,000 | 1,000 | 1,000 | 1,000 |
| r1-elk-design | 0,833 | 1,000 | 0,958 | 1,000 | 1,000 | 0,958 | 0,938 |

## H4 (a1, `--judge`, r1–11): mô tả

- A0-sonnet: n = 11, TB 0,985, sd 0,050, nhỏ nhất 0,833
- B0: n = 11, TB 1,000, sd 0,000, nhỏ nhất 1,000
