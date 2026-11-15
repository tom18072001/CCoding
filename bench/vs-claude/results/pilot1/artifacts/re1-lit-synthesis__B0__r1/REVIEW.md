# State of the Art in Log Anomaly Detection: A Corpus-Bounded Synthesis

## Benchmarks and comparability

Three benchmarks recur. HDFS-X has 11M session-labeled lines, HDFS-X-small is its 10% subset, and BGL-X has 4.7M line-labeled lines [P6]. The survey warns that HDFS-X-small results are not comparable to the full split, because the small variant has a different, easier test set; it does not rank methods [P6]. Leaderboards must therefore keep the two HDFS-X variants apart.

## Performance on the full HDFS-X split

Three papers report F1 on the full split: TF-LAD 0.931 [P1], RT-AD 0.948 [P3], and LogGraphT 0.962 [P4]. LogGraphT, a graph transformer over per-session graphs, leads, and its authors call it the best full-split result they know of [P4].

LogBERT-lite reports a higher 0.971, but on HDFS-X-small with a different train/test split; its authors did not evaluate the full split because of compute limits [P2]. Given the survey's warning [P6], that number cannot be set against the other three.

On BGL-X, LogBERT-lite scores 0.902 [P2], TF-LAD 0.874 [P1], and LogGraphT 0.915 [P4]. These are indicative only: the corpus does not show a shared setup, and label budgets differ (P1 and P3 use 80% labeled data; others mostly do not say).

## Is log parsing necessary?

The papers disagree. P1 calls template parsing a necessary first step, reporting a 9–14 point F1 drop when the parser is removed [P1]. P3 argues that a raw-token model matches or exceeds parser-based models, and that parser errors on evolving logs hurt them; it reports 0.948 for RT-AD against 0.931 for TF-LAD [P3][P1]. P2 also uses raw log lines but takes no stance [P2]. The question remains open, since no study isolates the parser's effect under identical conditions.

## Learning with few labels

P5 pretrains contrastively on unlabeled logs and fine-tunes on very few labels. With 0.5% labeled data on BGL-X, CL-LAD reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. It is the only result below 1% labels, and HDFS-X was not evaluated [P5].

## Gaps

- **Cost reporting is thin.** LogGraphT reports 3.1 ms inference latency per session on one A100 GPU, but no training cost [P4]. No paper reports energy consumption.
- **No common setup.** Methods are not compared under the same split, label budget, and preprocessing, and the survey does not fill this gap [P6].
- **Incomplete coverage.** LogBERT-lite has not been run on the full split [P2], and CL-LAD not on HDFS-X [P5].

## Conclusion

On the full HDFS-X split, LogGraphT leads at F1 0.962 [P4]. The strongest-looking number, 0.971, comes from an easier subset [P2][P6]. The parsing debate is unresolved [P1][P3], and low-label learning looks promising on BGL-X [P5]. A controlled benchmark that also reports training cost and energy would make claims comparable.
