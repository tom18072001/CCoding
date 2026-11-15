# State of the art in streaming log anomaly detection (corpus P1-P6)

## Methods and headline numbers
On the full SPR-Y split, the strongest reported result is the sketch-based StreamSift at F1 0.917 [P2]. It scores each event online with a count-sketch memory and runs at 410k events per second on eight CPU cores [P2]. The windowless EvtNet follows with F1 0.903 [P4], ahead of the windowed WinSeq at F1 0.884 [P1]. On OSK-Y the ordering changes: StreamSift reports F1 0.861 [P2], LiteTrace 0.847 [P5], WinSeq 0.839 [P1] and SelfTrail 0.823 [P3].

## Comparability caveats
LiteTrace reports F1 0.934 on SPR-Y-lite, which is higher than every full-split number, but that figure must not be compared with them [P5]. The survey explains why: SPR-Y-lite is a 15% subset with a different and easier test split, so results there are not comparable to the full split [P6]. LiteTrace was not evaluated on the full SPR-Y split [P5]. Any ranking must therefore be built on the full-split results only, and the survey itself declines to rank methods [P6].

## Label efficiency
Only one paper in the corpus works at a very small label budget. SelfTrail uses pseudo-labels from unlabeled logs and, with 0.8% labeled data on OSK-Y, reaches F1 0.823 against 0.655 for a supervised baseline at the same budget [P3]. The other labeled-data results rely on 70% labeled training data [P1][P4], so they are not directly comparable with the few-label setting. SelfTrail was not evaluated on SPR-Y [P3].

## Open disagreement: are windows necessary?
The corpus contains a direct disagreement. WinSeq's authors argue that fixed sliding windows are necessary and report a drop of 7 to 12 F1 points when the window module is removed [P1]. The EvtNet authors take the opposite position: a windowless model matches or exceeds windowed models, and window boundaries split causal event chains and hurt recall [P4]. On the full SPR-Y split the windowless model scores higher (0.903 against 0.884), but both papers train on the same 70% labeled share, so the evidence favours the windowless side only on this one benchmark [P1][P4].

## What the corpus does not tell us
Resource questions are only partly answered. StreamSift reports CPU throughput but states that GPU requirements are not reported [P2], so no GPU memory figure can be given from this corpus. Training cost and energy use are likewise absent from most papers. A practitioner choosing between these methods would need those numbers from outside the corpus before deciding.
