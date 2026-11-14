# State of the Art in Log Anomaly Detection: A Synthesis

This review is based only on the six summaries in the corpus [P1]-[P6]. All are fictional summaries, so conclusions are limited to what they report.

## Benchmarks and comparability

The main datasets are HDFS-X (11M lines, session-labeled), its 10% subset HDFS-X-small, and BGL-X (4.7M lines, line-labeled) [P6]. The survey warns that HDFS-X-small has a different and easier test set, so its scores cannot be compared with full-split scores [P6]. This matters for [P2]: LogBERT-lite reports F1 0.971 on HDFS-X-small and 0.902 on BGL-X, but it did not evaluate the full split, so the 0.971 should not be read as beating the full-split results [P2][P6]. [P6] catalogues benchmarks and does not rank methods.

## Results on the full HDFS-X split

Three papers report full-split F1:
- LogGraphT [P4] reaches 0.962, which is the highest in the corpus. It builds a session graph and applies a graph transformer. It also reports 0.915 on BGL-X.
- RT-AD [P3] reaches 0.948 using raw tokens.
- TF-LAD [P1] reaches 0.931 with Drain-style templates and an LSTM, and 0.874 on BGL-X.

On BGL-X, LogGraphT (0.915) is ahead of LogBERT-lite (0.902) and TF-LAD (0.874) [P4][P2][P1]. Not every paper states its training setup, so these comparisons are only indicative.

## An open disagreement: is parsing needed?

[P1] argues that template parsing is a necessary first step. Across three benchmarks, removing the parser lowered F1 by 9-14 points. [P3] takes the opposite view: a raw-token model matches or exceeds parser-based models, and it attributes this to parser errors on evolving logs. [P3] beats [P1]'s TF-LAD directly on the full split (0.948 vs 0.931). [P2] also works on raw log lines and gets strong results, which is consistent with [P3]. The evidence does not settle the question, because the two papers use different models.

## Label efficiency

[P1] and [P3] train with 80% labeled data. [P5] is the only paper with a very low label budget. With 0.5% labels on BGL-X, contrastive pretraining on unlabeled logs gives CL-LAD an F1 of 0.861, against 0.701 for a supervised baseline at the same budget. [P5] does not evaluate on HDFS-X. Its 0.861 is therefore not comparable with the HDFS-X results above, and it falls below the BGL-X scores of the 80%-label papers [P1][P4].

## Gaps

- Efficiency reporting is thin. [P4] gives inference latency (3.1 ms per session on one A100) but no training cost and no energy figures.
- No paper tests the same methods across the full set of label budgets and datasets.
- Few-label work [P5] has not been tested on the full HDFS-X split.

## Conclusion

Within this corpus, graph-based modelling [P4] is the best reported approach on the full HDFS-X split. The raw-token approach [P3] is the strongest challenge to parser-based pipelines [P1]. Low-label learning [P5] looks promising but has been shown on one dataset only. Comparisons need care about split and label budget [P6].
