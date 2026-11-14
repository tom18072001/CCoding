# Synthesis: log anomaly detection (closed corpus P1–P6)

## Benchmarks and comparability
The corpus evaluates on two datasets, HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled), plus HDFS-X-small, a 10% subset of HDFS-X [P6]. The survey warns that results on HDFS-X-small are not comparable to the full split because its test set is different and easier, and it does not rank methods [P6]. This matters for reading the headline numbers. LogBERT-lite reports F1 0.971 on HDFS-X-small, which is higher than any full-split result [P2]. That figure is not comparable, and the authors say they did not evaluate on the full split for compute reasons [P2].

## Full-split HDFS-X results
Only three papers report on the full split:
- TF-LAD, an LSTM over Drain-style templates, reaches F1 0.931 [P1].
- RT-AD, a model over raw tokens, reaches 0.948 [P3].
- LogGraphT, a graph transformer over per-session graphs, reaches 0.962 [P4].

LogGraphT is therefore the best full-split result in the corpus. Its authors describe it as the best they are aware of [P4]. On BGL-X the reported figures are TF-LAD 0.874 [P1], LogBERT-lite 0.902 [P2] and LogGraphT 0.915 [P4]. Protocols may differ across papers, so this is indicative only.

## Open disagreement: is parsing necessary?
The corpus contains a direct conflict. P1 argues that template parsing is a necessary first step. Its ablation shows that removing the parser lowers F1 by 9–14 points across three benchmarks [P1]. P3 argues the opposite. It says parsing is optional, that raw-token modelling matches or exceeds parser-based models, and that parser errors on evolving logs hurt parser-based systems [P3]. P3 even beats P1's TF-LAD on the full split (0.948 vs 0.931) [P3]. The disagreement is not settled by the corpus.

## Label efficiency
P1 and P3 train with 80% labeled data [P1][P3]. P5 takes the opposite approach. It uses contrastive pretraining on unlabeled logs and fine-tunes with 0.5% labels. On BGL-X it reaches F1 0.861 against 0.701 for a supervised baseline with the same label budget [P5]. This is the only sub-1% label result in the corpus. It was not evaluated on HDFS-X, so it cannot be compared with the full-split numbers [P5].

## Gaps
- Cost reporting is thin. LogGraphT reports inference latency of 3.1 ms per session on one A100 but no training cost [P4]. No paper reports energy consumption.
- Few-label methods have not been tested on HDFS-X [P5].
- Full-split results exist for only three methods [P1][P3][P4]. LogBERT-lite lacks a full-split result [P2].

## State of the art
On the full HDFS-X split the best reported method is LogGraphT [P4]. Parser-free approaches look competitive [P3], though this is contested [P1]. Label-efficient pretraining is promising but is only shown on BGL-X [P5]. Future work should use the full split consistently and report cost, as [P6] cautions.
