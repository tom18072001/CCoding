# Synthesis: log anomaly detection (closed corpus P1–P6)

## Benchmarks and comparability
The corpus evaluates on two benchmarks, HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled), plus HDFS-X-small, a 10% subset of HDFS-X [P6]. The survey warns that HDFS-X-small has a different, easier test set, so its numbers cannot be compared with full-split results, and it does not rank methods [P6]. This matters because LogBERT-lite reports F1 0.971 on HDFS-X-small [P2], which is higher than any full-split number. P2 states explicitly that it did not evaluate on the full split [P2]. That figure should therefore not be read as state of the art.

## Full-split results
On the full HDFS-X split the reported F1 values are:
- LogGraphT: 0.962 [P4]
- RT-AD: 0.948 [P3]
- TF-LAD: 0.931 [P1]

LogGraphT builds a session graph and applies a graph transformer [P4]. P4 calls its result the best it is aware of on the full split, and within this corpus it is the highest. On BGL-X the reported values are LogGraphT 0.915 [P4], LogBERT-lite 0.902 [P2], TF-LAD 0.874 [P1] and CL-LAD 0.861 [P5]. CL-LAD's figure is at a 0.5% label budget, so it is not directly comparable to the others. Cross-paper comparisons are indicative only.

## Is log parsing necessary?
This is the main disagreement in the corpus. P1 argues that template extraction is a necessary first step. Removing the parser cost 9–14 F1 points across three benchmarks in its experiments [P1]. P3 takes the opposite position: a model over raw tokens matches or exceeds parser-based models, and parser errors on evolving logs hurt parser-based systems [P3]. P3 reports RT-AD at 0.948 against TF-LAD at 0.931 on the full HDFS-X split [P3][P1]. P2 also uses raw log lines [P2]. The evidence is mixed. The comparison between P1 and P3 is on one dataset, and P1's ablation is internal to its own model.

## Label efficiency
P1 and P3 train with 80% labeled data [P1][P3]. P5 goes the other way. It pretrains contrastively on unlabeled logs and fine-tunes with 0.5% labels on BGL-X. There CL-LAD reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. P5 does not evaluate on HDFS-X, so its label-efficiency claim is not tested on the full HDFS-X split [P5].

## Cost and gaps
Cost reporting is sparse. P4 gives inference latency of 3.1 ms per session on one A100 GPU and no training cost [P4]. P2 mentions a 22M-parameter encoder and compute limits [P2]. No paper in the corpus reports energy consumption.

## Takeaways
1. The best full-split HDFS-X result in the corpus is LogGraphT at 0.962 [P4].
2. The parsing question is unresolved, with P1 and P3 in direct conflict.
3. Few-label learning has been shown only on BGL-X [P5].
