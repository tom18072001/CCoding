# Synthesis: log anomaly detection (closed corpus P1–P6)

**Scope.** This review uses only six short summaries, all marked fictional in the corpus. They are summaries, not full papers, so the evidence is thin and unverified.

## Benchmarks and comparability
The corpus uses two benchmarks. HDFS-X has 11M lines and session labels. BGL-X has 4.7M lines and line labels [P6]. HDFS-X-small is a 10% subset of HDFS-X. Its test set is different and easier, so its results are not comparable to full-split results [P6]. This matters for [P2]. LogBERT-lite reports F1 0.971 on HDFS-X-small, which looks higher than every full-split number. That is not a like-for-like comparison. [P2] states it did not evaluate on the full split, and [P6] declines to rank methods.

## Full HDFS-X split
Three papers report full-split F1:
- TF-LAD: 0.931 [P1].
- RT-AD: 0.948 [P3].
- LogGraphT: 0.962 [P4].

LogGraphT is the highest. [P4] calls it "the best result we are aware of on the full split", which is the authors' own claim. On BGL-X the reported F1 values are 0.874 for TF-LAD [P1], 0.902 for LogBERT-lite [P2] and 0.915 for LogGraphT [P4]. Differences in setup between papers are not described, so these comparisons are indicative only.

## Disagreement: is log parsing necessary?
[P1] argues that parsing into templates is a necessary first step. Removing the parser cost 9–14 F1 points across three benchmarks. [P3] disagrees: a raw-token model matches or exceeds parser-based models, and it attributes this to parser errors on evolving logs. [P3] also beats TF-LAD directly on the full split, 0.948 versus 0.931. [P2] works on raw log lines and is consistent with [P3], but it does not test the question directly. [P4] uses session graphs and takes no explicit position. The question is unresolved, because the two papers differ in architecture and evaluation, and [P1]'s ablation is not run against [P3]'s model.

## Label efficiency
[P1] and [P3] train with 80% labeled data. Only [P5] studies the low-label regime. With 0.5% labels on BGL-X, contrastive pretraining reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. [P5] does not evaluate on HDFS-X, so its low-label result cannot be compared with the others.

## Gaps
- **Energy.** No paper reports inference energy. [P4] gives only latency, 3.1 ms per session on one A100, and no training cost.
- **Low-label HDFS-X.** There are no low-label results on HDFS-X.
- **Shared protocol.** No paper evaluates all methods under the same protocol, and the survey does not rank methods [P6].
- **Parsing question.** A controlled test of the parsing question on the full split is missing.

## Conclusion
On the full HDFS-X split the best reported F1 is 0.962 [P4]. The evidence for it comes from authors' own reports. The parsing debate [P1] vs [P3] is open. Low-label detection is promising on BGL-X [P5] but untested on HDFS-X.
