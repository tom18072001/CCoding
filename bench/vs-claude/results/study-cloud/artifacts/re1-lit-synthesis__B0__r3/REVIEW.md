# State of the Art in Log Anomaly Detection: A Synthesis of a Closed Corpus

*Note: P1–P6 are fictional paper summaries; this draft rests only on them and makes no claim about real literature.*

## (a) Problem and benchmarks

The corpus addresses anomaly detection on system logs. A survey [P6] catalogues three benchmarks: HDFS-X (11M lines, session-labeled), its 10% subset HDFS-X-small, and BGL-X (4.7M lines, line-labeled). [P6] warns that HDFS-X-small has a different, easier test set, so its results are not comparable to the full split.

## (b) Reported results

On the HDFS-X full split, the reported F1 scores are 0.962 for LogGraphT [P4], 0.948 for RT-AD [P3] and 0.931 for TF-LAD [P1]. [P3] also reports 0.931 for TF-LAD, so the two papers agree on that number. Within this corpus, [P4] is therefore highest. That ranking rests on [P4]'s own claim of "the best result we are aware of" and on a comparison I made across papers. [P6] does not rank methods, and the corpus contains no independent cross-comparison table.

LogBERT-lite reports 0.971 on HDFS-X-small only [P2]. By [P6] this figure cannot be compared with the full-split results, and [P2] states it did not evaluate the full split.

On BGL-X, the reported scores are 0.915 [P4], 0.902 [P2] and 0.874 [P1]. Label budgets differ. [P1] and [P3] use 80% labeled data, and the corpus does not state the label fraction for [P2] or [P4]. These BGL-X numbers are therefore only loosely comparable.

## (c) Disagreement on parsing

[P1] holds that template parsing is a necessary first step. It reports that removing the parser lowers F1 by 9–14 points across three benchmarks. [P3] takes the opposite position: a raw-token model matches or exceeds parser-based ones, scoring 0.948 against TF-LAD's 0.931 on the full split. [P3] attributes the gap to parser errors on evolving logs. Because [P3] compares itself with the [P1] system, the evidence is directly opposed, but the corpus offers no study that resolves it.

## (d) Label efficiency

CL-LAD pretrains contrastively on unlabeled logs [P5]. With 0.5% labeled data on BGL-X it reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. This is the only result in the corpus below 1% labels. It should not be compared directly with methods trained on 80% labels [P1][P3]; for reference, [P1] reaches 0.874 on BGL-X with 80% labels.

## (e) Gaps

- **Energy and cost:** No paper reports energy consumption. [P4] gives only inference latency (3.1 ms per session on one A100 GPU) and no training cost.
- **Coverage:** [P2] lacks a full-split evaluation. [P5] does not evaluate on HDFS-X.
- **Comparability:** Label fractions are missing for [P2] and [P4], and the corpus has no common protocol for comparing methods [P6].

Overall, graph-based session modelling [P4] leads where full-split comparisons exist, while parsing necessity and few-label performance on HDFS-X remain unresolved in this corpus.
