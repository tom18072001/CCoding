# State of the art in log anomaly detection (corpus P1-P6)

## Methods and headline numbers
On the full HDFS-X split, the strongest reported result is the graph-based LogGraphT at F1 0.962 [P4]. It builds a session graph and applies a graph transformer, and its inference latency is 3.1 ms per session on one A100 GPU [P4]. The raw-token model RT-AD follows with F1 0.948 [P3], ahead of the template-based TF-LAD at F1 0.931 [P1]. On BGL-X the ordering is different: LogBERT-lite reports F1 0.902 [P2], LogGraphT 0.915 [P4] and TF-LAD 0.874 [P1].

## A disagreement about parsing
The corpus is split on whether log parsing into templates is necessary. P1 argues that it is: removing the parser lowered F1 by 9-14 points across three benchmarks, and TF-LAD uses Drain-style templates with an LSTM [P1]. P3 argues the opposite, that a model over raw tokens matches or exceeds parser-based systems, and attributes the gap to parser errors on evolving logs [P3]. Both papers use 80% labeled data, so the label budget does not explain the difference, but the two papers do not evaluate the same ablation, so the conflict is not resolved by the evidence available here.

## Comparability caveats
LogBERT-lite reports F1 0.971 on HDFS-X-small, a 10% subset with a different train/test split, and explicitly did not evaluate the full split [P2]. The benchmark survey warns that results on HDFS-X-small are not comparable to the full split because the test set is easier [P6]. The 0.971 figure therefore must not be ranked against the 0.962 of LogGraphT on the full split [P4][P6]. The survey itself does not rank methods [P6], and the labels also differ between datasets: HDFS-X is session-labeled while BGL-X is line-labeled [P6].

## Low-label learning
Only one paper addresses very small label budgets. CL-LAD pretrains contrastively on unlabeled logs and, with 0.5% labeled data on BGL-X, reaches F1 0.861 against 0.701 for a supervised baseline at the same budget [P5]. It is not evaluated on HDFS-X, so its result cannot be compared with the full-split ranking above [P5].

## Gaps
Several quantities that practitioners would want are absent from the corpus. LogGraphT reports no training cost [P4], and no paper reports inference energy consumption. LogBERT-lite has no full-split result [P2]. No paper evaluates the parsing question and the graph approach together, so it is unknown whether session graphs reduce or increase the dependence on templates. Until such controlled comparisons exist, the safest summary is that graph transformers lead on the full HDFS-X split [P4], that the parser necessity claim is contested [P1][P3], and that subset results and low-label results need separate treatment [P2][P5][P6].
