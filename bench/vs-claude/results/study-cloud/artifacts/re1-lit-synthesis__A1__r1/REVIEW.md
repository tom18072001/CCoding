# State of the Art in Log Anomaly Detection: A Synthesis

## Benchmarks and comparability

The corpus evaluates on two datasets, HDFS-X and BGL-X. The survey [P6] describes HDFS-X as 11M session-labeled lines and BGL-X as 4.7M line-labeled lines. It also defines HDFS-X-small, a 10% subset of HDFS-X. [P6] warns that results on HDFS-X-small are not comparable to the full split, because its test set is different and easier. It does not rank methods.

This warning matters for the headline numbers. LogBERT-lite [P2] reports F1 0.971 on HDFS-X-small, which is the highest HDFS-derived number in the corpus. [P2] says it did not evaluate on the full split, so that number cannot be compared with the others. On the full HDFS-X split, three results are comparable:

| Method | Paper | F1 |
|---|---|---|
| LogGraphT | [P4] | 0.962 |
| RT-AD | [P3] | 0.948 |
| TF-LAD | [P1] | 0.931 |

LogGraphT, a graph transformer over per-session graphs, is the best result [P4] knows of on the full split. On BGL-X the reported F1 values are 0.915 for LogGraphT [P4], 0.902 for LogBERT-lite [P2], and 0.874 for TF-LAD [P1]. [P5] also reports a BGL-X number, but at a very different label budget (see below). The papers report separately, so small gaps need caution.

## An open disagreement: is parsing necessary?

[P1] argues that template extraction is a necessary first step. It reports that removing the parser reduced F1 by 9-14 points across three benchmarks. Its TF-LAD model uses Drain-style templates with an LSTM. [P3] takes the opposite view: a model over raw tokens (RT-AD) matches or exceeds parser-based models, and [P3] attributes this to parser errors on evolving logs. [P3] also scores RT-AD at 0.948 against TF-LAD's 0.931 on the full HDFS-X split. [P2] also works on raw log lines, with a small 22M-parameter encoder, and scores well. That is consistent with [P3], but [P2] does not test the parsing question directly. The question remains unresolved. [P1]'s ablation and [P3]'s comparison use different setups.

## Label efficiency

[P1] and [P3] both train with 80% labeled data. [P5] is the only paper in the corpus that reports results with under 1% labels. With 0.5% labeled data on BGL-X, its contrastively pretrained CL-LAD reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. [P5] does not evaluate on HDFS-X, so its method cannot be placed on the full-split table above.

## Gaps

- Training cost is not reported in [P4]. Its only efficiency figure is a latency of 3.1 ms per session on one A100 GPU.
- Energy consumption is not reported in any paper in the corpus.
- Parsing versus raw-token input has not been tested under a common setup.

## Summary

On the full HDFS-X split, graph-based modeling [P4] currently leads, followed by raw-token modeling [P3] and template-based modeling [P1]. Contrastive pretraining [P5] looks promising when labels are scarce. Comparisons should use the full split, not HDFS-X-small [P6][P2].
