# Log Anomaly Detection Synthesis

This review draws only on the six corpus summaries (P1–P6); the evidence is thin, so conclusions are tentative.

## Benchmarks and comparability

The main datasets are HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. HDFS-X also has a 10% subset, HDFS-X-small, with a different and easier test set. The survey warns that results on the subset are not comparable to the full split, and it ranks no methods [P6]. This matters for reading the numbers. LogBERT-lite reports F1 0.971 on HDFS-X-small, which looks highest [P2]. Its authors say they never evaluated on the full split [P2], so that figure cannot be ranked against the others.

## Best reported results

On the full HDFS-X split, three methods are directly comparable:

- LogGraphT (graph transformers over per-session graphs): F1 0.962 [P4]
- RT-AD (raw-token model): F1 0.948 [P3]
- TF-LAD (Drain-style templates plus an LSTM): F1 0.931 [P1]

LogGraphT is the best full-split result, and its authors call it the best they know of [P4]. On BGL-X the reported scores are LogGraphT 0.915 [P4], LogBERT-lite 0.902 [P2], TF-LAD 0.874 [P1], and CL-LAD 0.861 at only 0.5% labels [P5]. These are cross-paper figures, not a controlled comparison. P1 and P3 both train on 80% labeled data [P1][P3].

## The central disagreement: is parsing necessary?

P1 and P3 disagree directly. P1 argues that template parsing is a necessary first step. It reports that removing the parser cost 9–14 F1 points across three benchmarks [P1]. P3 argues the opposite, that parsing is optional. Its raw-token model matches or beats parser-based systems, scoring 0.948 against TF-LAD's 0.931 on the full split [P3]. P3 also blames parser errors on evolving logs for hurting template-based systems [P3]. P2 supports the raw-input view. It fine-tunes a small encoder on raw log lines and gets strong results [P2], though only on the subset and BGL-X. The evidence leans toward parsing-free models, but P1's ablation is unrebutted.

## Label efficiency

Most work assumes heavy supervision, such as the 80% labels in P1 and P3. P5 is the only paper in the corpus with under 1% labeled data. It uses contrastive pretraining on unlabeled logs, and on BGL-X with 0.5% labels it reaches F1 0.861 against 0.701 for a supervised baseline at the same budget [P5]. It did not evaluate on HDFS-X, so its label-efficiency claim is unverified on the harder session-level benchmark [P5].

## Gaps

- Efficiency is under-reported. P4 gives inference latency (3.1 ms per session on one A100) but no energy consumption and no training cost [P4]. No paper in the corpus reports energy at all.
- No study compares parsing, graph structure and low-label regimes on a shared benchmark.

## Takeaway

Graph-structured session modeling currently leads on full HDFS-X [P4]. Parsing looks dispensable, though that is contested [P1][P3]. Few-label learning is promising but under-tested [P5]. Future work should use the full split, as the survey recommends [P6], and report cost and energy.
