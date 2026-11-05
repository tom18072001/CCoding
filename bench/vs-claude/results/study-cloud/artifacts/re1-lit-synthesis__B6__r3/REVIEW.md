# State of the art: log anomaly detection (corpus P1–P6 only)

## Benchmarks
Papers evaluate on HDFS-X (11M lines, session labels), BGL-X (4.7M lines, line labels) and HDFS-X-small (10% subset) [P6]. The survey warns that HDFS-X-small results are not comparable with the full split because the test set differs and is easier, and it does not rank methods [P6]. Comparisons must therefore be kept per split.

## Results on full HDFS-X
Three papers report on the full split: LogGraphT (graph transformer over session graphs) reaches F1 0.962 [P4]; RT-AD (raw-token model) 0.948 [P3]; TF-LAD (template + LSTM) 0.931 [P1]. LogBERT-lite's 0.971 [P2] is on HDFS-X-small and is excluded from this ranking; P2 does not evaluate the full split. On BGL-X the values are 0.915 [P4], 0.902 [P2] and 0.874 [P1]; P3 does not report BGL-X. All figures are self-reported, with no independent replication and heterogeneous training setups.

## Is log parsing necessary?
This is the clearest disagreement. P1 argues template extraction is a necessary first step: removing the parser lowers F1 by 9–14 points across three benchmarks [P1]. P3 argues it is unnecessary, since a raw-token model matches or exceeds a parser-based one (0.948 vs 0.931) and parser errors hurt on evolving logs [P3]. The evidence is asymmetric: P3's claim rests on one dataset, whereas P1's ablation spans three, so neither side is settled. P2 also works on raw logs but does not test the question directly [P2]. A shared ablation under identical conditions is missing.

## Learning with few labels
P1 and P3 train with 80% labeled data. P5 is the only paper with under 1% labels: at 0.5% on BGL-X, contrastive pre-training (CL-LAD) reaches F1 0.861 versus 0.701 for a supervised baseline with the same label budget [P5]. P5 does not evaluate HDFS-X, so it cannot be ranked against the methods above.

## Cost and efficiency
Only P4 reports inference latency (3.1 ms per session on one A100) and no training cost [P4]. P2 notes compute limits for its 22M-parameter model [P2]. No paper reports energy consumption, so LogGraphT's inference energy is not answerable from the corpus.

## Gaps
- No like-for-like comparison of low-label [P5] and high-label methods on HDFS-X.
- LogBERT-lite lacks a full-split evaluation [P2].
- No energy or training-cost data [P4].
- Parsing debate needs a joint ablation [P1][P3].

**Conclusion:** on full HDFS-X, LogGraphT leads by self-reported F1 [P4], but evidence is thin and evaluation protocols are inconsistent.
