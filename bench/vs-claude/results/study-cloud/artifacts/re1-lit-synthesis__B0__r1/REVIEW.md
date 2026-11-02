# State of the Art in Log Anomaly Detection: A Synthesis of the Corpus

All six papers in the corpus are fictional summaries, so the conclusions below describe this corpus only.

## Benchmarks and comparability

HDFS-X has 11M session-labeled lines, and BGL-X has 4.7M line-labeled lines [P6]. HDFS-X-small is a 10% subset of HDFS-X [P6][P2]. The survey warns that HDFS-X-small results are not comparable to the full split, because its test set is different and easier [P6]. It does not rank methods [P6].

## Performance on the full HDFS-X split

Three papers report F1 on the full split:

- TF-LAD: 0.931 [P1]
- RT-AD: 0.948 [P3]
- LogGraphT: 0.962 [P4]

LogGraphT's authors call this the best result they are aware of on the full split [P4]. This is a self-report.

LogBERT-lite reports F1 0.971, but only on HDFS-X-small, and it was not evaluated on the full split because of compute limits [P2]. Given the warning in [P6], that figure is not ranked against the full-split results.

On BGL-X, the reported F1 values are 0.874 for TF-LAD [P1], 0.902 for LogBERT-lite [P2], and 0.915 for LogGraphT [P4]. LogGraphT is highest, but protocols may differ, so this ordering is tentative.

## Is log parsing necessary?

The papers disagree. [P1] argues that parsing into templates is a necessary first step. Removing the parser reduced F1 by 9-14 points across three benchmarks in their experiments [P1]. [P3] takes the opposite position. It reports that a model over raw tokens matches or exceeds parser-based models, and it attributes the gap to parser errors on evolving logs [P3]. [P2] also works on raw log lines, but it makes no claim about whether parsing is needed [P2]. [P3] compares directly against TF-LAD on the full split, 0.948 versus 0.931.

## Label efficiency

[P1] and [P3] train with 80% labeled data. [P5] is the only paper in the corpus that reports results with less than 1% labels. With 0.5% labeled data on BGL-X, CL-LAD reaches F1 0.861, against 0.701 for a supervised baseline at the same label budget [P5]. The method pretrains contrastively on unlabeled logs [P5]. This rests on one dataset; [P5] does not evaluate on HDFS-X.

## Gaps and limitations

- **Cost:** [P4] reports inference latency of 3.1 ms per session on one A100 GPU, but not training cost. No paper reports inference energy, so energy comparisons cannot be made from this corpus.
- **Coverage:** [P2] lacks a full-split HDFS-X result, and [P5] lacks any HDFS-X result. No single method is evaluated under every condition (full split, BGL-X, low-label).
- **Ranking:** [P6] provides no ranking, so any ordering here is assembled from separate self-reported numbers.
- **Evidence base:** All papers are fictional summaries, and the conclusions should not be generalized.

## Conclusion

Within this corpus, LogGraphT has the highest F1 on the full HDFS-X split (0.962) [P4]. The parsing debate is open [P1][P3]. Low-label learning is shown only by [P5] on BGL-X. Shared splits, label budgets, and cost reporting would make comparisons easier.
