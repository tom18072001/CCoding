# CCoding vs single Claude — benchmark suite

Compares CCoding's multi-agent office with a single Claude agent on the same briefs, workspaces, tools and runtime. Node ≥ 22, no dependencies.

## Layout

```
arms.json          systems under test (A0-opus, A0-sonnet, A1, A2, B0-B5, oracle, null)
run.mjs            runs arms × tasks × repeats (interleaved, resumable), grades, snapshots deliverables
analyze.mjs        hypotheses H1–H10, per-category scores, cost-quality frontier -> report.md, summary.csv, pareto.csv
pairwise.mjs       blinded pairwise LLM judge (both orders) for design / requirements / research deliverables
lib/               claude.mjs (single-agent arm) · ccoding.mjs (REST arm) · grade.mjs · judge.mjs
tasks/<id>/        task.json (brief, category, size, grader) · repo/ (starting workspace) · hidden/ (tests, answers, references — never copied)
```

## Tasks (13)

| Id | Category | Parts | Grader |
| --- | --- | --- | --- |
| c1-iis-ecs | coding | 2 | hidden node:test (6) |
| c2-burst-alert | coding | 2 | hidden node:test (7) |
| c3-shop-bugs | coding | 3 | hidden node:test (6), 3 seeded bugs in 3 files |
| c4-audit-chain | coding | 4 | hidden node:test (7) |
| c5-tickets-api | coding | 5 | hidden node:test (9), backward-compat trap |
| l1-oncall | logic | 1 | exact match (3 fields) |
| l2-knights | logic | 1 | exact match |
| l3-reconcile | logic | 2 | exact match; timezone, duplicate, refund, void traps |
| l4-startup-order | logic | 2 | exact match; hidden cycle |
| s1-sec-review | review | 3 | F1 over 7 seeded vulns + 3 decoys |
| a1-ambiguous-spec | requirements | 3 | 6-item checklist (regex or `--judge`) |
| r1-elk-design | design | 4 | 8-item checklist (regex or `--judge`), license trap |
| re1-lit-synthesis | research | 3 | answers, citation validity, correct refusal |

## Run

```bash
# 0. Grader self-test (no LLM, ~5 s): oracle must score 1.00 on every task, null near 0
node bench/vs-claude/run.mjs --arms oracle,null --repeats 1 --out bench/vs-claude/results/selftest

# 1. Start CCoding (for B arms)
node dist/cli.js serve

# 2. Pilot: 2 arms × 13 tasks × 1 repeat
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --repeats 1 --out bench/vs-claude/results/pilot

# 3. Full study (resumable — re-run the same command after an interruption)
node bench/vs-claude/run.mjs --arms A0-opus,A0-sonnet,A1,A2,B0,B1,B2 --repeats 3 --judge --out bench/vs-claude/results/full

# 4. Analyse
node bench/vs-claude/analyze.mjs bench/vs-claude/results/full --baseline A0-sonnet --treatment B0
node bench/vs-claude/pairwise.mjs bench/vs-claude/results/full --x A0-opus --y B0
```

Options: `--tasks all|<id>,<prefix>,<category>` · `--repeats N` · `--timeout <min>` · `--runtime claude-cli` · `--ccoding-url` · `--ccoding-data <CCoding data dir>` (for `calls.jsonl` token detail; default `../../data`) · `--judge --judge-model opus` · `--claude-bin <path>` · `--work <dir>` (workspaces; default OS temp) · `--dry-run`.

## Verified

- 2026-11-02: grader self-test - oracle 1.00 on all 13 tasks, null 0-0.22 (`results/selftest/`).
- 2026-11-02: CCoding arm end-to-end against `node dist/cli.js serve` with `--runtime mock` (B0 and B5): project registration, task submission, polling, FINAL.md, calls.jsonl token accounting and phase breakdown (route ... accept) all work. Single-Claude arms tested with a stub `claude` binary.

## Fairness rules

- Same brief text, fresh git workspace per run, tools `Read,Write,Edit,Bash,Grep,Glob`, no web, same runtime.
- Workspaces live outside the suite; any run whose transcript or tool calls touch `hidden/`, answers or checklists is flagged `leak` and excluded.
- Order is interleaved and rotated per repeat. Run when the machine is idle; do not mix plans or rate-limit states mid-study.
- CCoding runs with `planApproval: false` (no director approval wait) and `budgetMode: complete`. B4 turns CTO acceptance off; B5 assigns the whole brief to one CCoding agent (`senior-swe`) to separate CCoding's scaffolding from the multi-agent office.
- CCoding writes its FINAL report in Vietnamese; graders only read the deliverable files, and the pairwise judge is told to ignore language.
- A2 picks its best candidate using only visible tests or a self-judge, never hidden graders.
- Weighted tokens = input + 1.25 × cache write + 0.1 × cache read + 5 × output (same as `ccoding bench`).

## Output (`results/<run>/`)

`runs.jsonl` (one row per run: score, details, tokens, cost, wall time, leak flag) · `artifacts/<key>/` (deliverable snapshot + `_FINAL.txt`) · `report.md` · `summary.csv` · `pareto.csv` · `pairwise.jsonl` / `pairwise.md`.

## Older harness on this branch (`harness/`, tasks t1–t5, rounds C1–C9)

Before this suite, the `perf/vs-claude-loop` branch measured the same question with `harness/run.mjs` on five coding tasks
(`tasks/t1-duration` … `tasks/t5-logq`: `starter/`, `prompt.txt`, `hidden/`, `ref/`; no `task.json`, so `run.mjs` above skips them).
Docs: [`harness/README.md`](harness/README.md); results: `results/C1` … `results/C9`, `results/runs.csv`; analysis: `docs/PROCESS-REVIEW.md` §13 and `docs/research/`.
