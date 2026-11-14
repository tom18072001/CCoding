# Tổng quan: log anomaly detection (corpus P1–P6)

Scope note: this synthesis uses only the six summaries in `corpus/`. All are marked fictional; the claims below are what the summaries report, not independently verified.

## Benchmarks and comparability

The papers use two datasets: HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. HDFS-X also has a 10% subset, HDFS-X-small, which has a different and easier test set. The survey warns that scores on the subset cannot be compared with scores on the full split, and it does not rank methods [P6].
## Results on the full HDFS-X split

Three papers report F1 on the full split:
- TF-LAD reaches 0.931 [P1].
- RT-AD reaches 0.948 [P3].
- LogGraphT reaches 0.962 [P4]. This is the highest reported value in the corpus, and the authors call it "the best result we are aware of on the full split" [P4].

LogBERT-lite reports a higher number, F1 0.971, but only on HDFS-X-small. It is not comparable and should not be ranked above LogGraphT [P2][P6]. The authors say they did not evaluate on the full split because of compute limits [P2].

On BGL-X the reported scores are:
- LogGraphT 0.915 [P4]
- LogBERT-lite 0.902 [P2]
- TF-LAD 0.874 [P1]
- CL-LAD 0.861, at only 0.5% labels [P5]

## Is parsing necessary?

The corpus disagrees on this.
- [P1] argues that template parsing is a necessary first step. Removing the parser cost 9–14 F1 points across three benchmarks.
- [P3] argues the opposite. A raw-token model matches or exceeds parser-based models, and parser errors on evolving logs hurt parser-based systems. RT-AD beats TF-LAD on the full split, 0.948 vs 0.931.
- [P2] also uses raw log lines, consistent with [P3], but does not test the question directly.

These summaries do not settle the disagreement.

## Label efficiency

Most methods train with heavy supervision, for example 80% labeled data in [P1] and [P3]. [P5] is the only paper below 1% labels. With 0.5% labels on BGL-X, CL-LAD reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. It uses contrastive pretraining on unlabeled logs. [P5] does not evaluate on HDFS-X, so its result cannot be compared directly with the HDFS-X leaders.

## Gaps

- **Cost and energy.** [P4] reports inference latency (3.1 ms per session on one A100) but no training cost. No paper in the corpus reports energy consumption.
- **Missing evaluations.** [P2] has no full-split result; [P5] has no HDFS-X result.
- **Evidence quality.** Each claim is a single, unreplicated, self-reported result.

## Conclusion

On the full HDFS-X split, graph-based LogGraphT [P4] is currently the strongest reported method. The parsing question is contested between [P1] and [P3]. Low-label work [P5] shows promise but is evaluated only on BGL-X. Future work should evaluate on the full split, report energy and training cost, and test parsing ablations across architectures.
