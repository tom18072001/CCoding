# State of the Art in Log Anomaly Detection: A Corpus Synthesis

This review draws only on the six summaries in the corpus [P1]-[P6]. All are fictional, and the numbers are as reported by their authors.

## Benchmarks and comparability

Two datasets dominate: HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. The survey also lists HDFS-X-small, a 10% subset of HDFS-X, and warns that results on it are not comparable to the full split, because its test set is different and easier [P6]. This matters for reading the leaderboard. LogBERT-lite reports F1 0.971 on HDFS-X-small [P2]. That is the largest HDFS-related number in the corpus, but it is not a full-split result. The authors say they did not evaluate on the full split because of compute limits [P2]. It should not be ranked against the others.

## Full-split HDFS-X results

Three papers report full-split F1:

| Method | Paper | F1 |
|---|---|---|
| TF-LAD | [P1] | 0.931 |
| LogGraphT | [P4] | 0.962 |
| RT-AD | [P3] | 0.948 |

Taken at face value, [P4]'s 0.962 is the highest. It is also the only claim that conflicts with the other reports. [P4] calls its result "the best result we are aware of", and nothing else in the corpus shows a higher full-split number. By the numbers, the strongest full-split method is therefore LogGraphT [P4]. This differs from my answer.json, which gives q1 as P3 with 0.948. That answer is wrong and should be corrected to P4 with 0.962. Details are in the note at the end.

On BGL-X, LogGraphT reaches F1 0.915 [P4], LogBERT-lite 0.902 [P2] and TF-LAD 0.874 [P1].

## The parsing debate

The corpus disagrees on whether log parsing is needed. [P1] argues that template extraction is a necessary first step. Removing the parser cost 9-14 F1 points across three benchmarks. [P3] argues the opposite. A raw-token model (RT-AD) matches or exceeds parser-based models, and it attributes the gap to parser errors on evolving logs. [P3] explicitly beats TF-LAD (0.948 vs 0.931) on the full split. [P2] also works on raw log lines, with no parser, and gets competitive scores. This is indirect support for [P3]. [P4] models session graphs and does not take a position in the summary.

## Label efficiency

Both [P1] and [P3] train with 80% labeled data. [P5] is the only paper in the sub-1% regime. With 0.5% labels on BGL-X, contrastive pretraining (CL-LAD) reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. It does not evaluate on HDFS-X, so its result cannot be compared with the full-split table.

## Gaps

- Energy use is not reported anywhere. [P4] gives only latency (3.1 ms per session on one A100) and no training cost.
- No paper compares all methods under one protocol. Most methods report only one dataset or a different split.
- The parsing question is unresolved. [P1] and [P3] use different models, so the comparison is confounded.
