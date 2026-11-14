# State of the Art in Log Anomaly Detection: A Closed-Corpus Synthesis

## Benchmarks and comparability

Three benchmarks recur in the corpus. HDFS-X has 11M session-labeled lines, HDFS-X-small is its 10% subset, and BGL-X has 4.7M line-labeled lines [P6]. The survey warns that HDFS-X-small results are not comparable to the full split, because the subset uses a different and easier test set [P6]. It also does not rank methods [P6], so any ordering below is our own reading of numbers reported in separate papers, not a shared leaderboard.

## Supervised methods

On the full HDFS-X split, LogGraphT reaches F1 0.962 and describes this as the best result its authors know of on that split [P4]. RT-AD follows at 0.948 [P3], then TF-LAD at 0.931 [P1]. On BGL-X the order is LogGraphT 0.915 [P4], LogBERT-lite 0.902 [P2], and TF-LAD 0.874 [P1].

LogBERT-lite's F1 of 0.971 is the highest headline figure, but it was measured on HDFS-X-small, and the authors did not evaluate on the full split [P2]. Given the warning in [P6], that number should not be placed above [P4]. [P1] and [P3] train on 80% labeled data.

## Is log parsing necessary?

The corpus contains a direct disagreement. TF-LAD's authors argue that parsing into templates is a necessary first step. They report that removing the parser lowered F1 by 9-14 points across three benchmarks [P1]. RT-AD's authors argue the opposite. They report that a model over raw tokens matches or exceeds parser-based models, scoring 0.948 against 0.931 for TF-LAD on full HDFS-X, and they attribute the gap to parser errors on evolving logs [P3]. LogBERT-lite also works on raw log lines [P2], though it makes no explicit claim about parsing. The evidence is not enough to settle the question. [P3] offers one head-to-head comparison on one benchmark, while [P1] reports an ablation of its own pipeline.

## Learning with few labels

With 0.5% labeled data on BGL-X, CL-LAD reaches F1 0.861. A supervised baseline at the same label budget reaches 0.701 [P5]. This is the only sub-1% result in the corpus. Its figure of 0.861 is below the fully supervised BGL-X results in [P4] and [P2], but those papers use different label budgets or do not state them, so the gap is not a like-for-like comparison.

## Gaps

- **No cost reporting.** No paper reports energy consumption. LogGraphT gives only an inference latency of 3.1 ms per session on one A100 GPU and states that it does not report training cost [P4].
- **Missing evaluations.** CL-LAD was not evaluated on HDFS-X [P5], and LogBERT-lite was not evaluated on the full split [P2]. Neither can be placed directly against [P1], [P3] or [P4] on HDFS-X.
- **Unstated label budgets.** [P2] and [P4] do not state their training label percentages in the summaries.
- **No shared ranking.** The survey catalogues datasets but does not rank methods [P6], so the field lacks a common comparison across benchmarks and label budgets.

Overall, LogGraphT leads the reported results on full HDFS-X and BGL-X [P4].
