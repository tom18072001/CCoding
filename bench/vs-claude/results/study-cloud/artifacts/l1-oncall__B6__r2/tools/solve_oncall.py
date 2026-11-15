#!/usr/bin/env python3
"""Brute-force on-call rota puzzle: duyệt 120 hoán vị, mã hóa 7 luật."""
import json
import os
from itertools import permutations

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
NAMES = ["An", "Binh", "Chi", "Dung", "Em"]

RULES = {
    1: lambda p: p["An"] not in (0, 4),
    2: lambda p: p["Binh"] == p["Chi"] + 1,
    3: lambda p: p["Dung"] < p["An"],
    4: lambda p: abs(p["Em"] - p["Binh"]) != 1,
    5: lambda p: p["Chi"] != 0,
    6: lambda p: p["Em"] != 2,
    7: lambda p: abs(p["Dung"] - p["Em"]) != 1,
}


def main():
    perms = [dict(zip(perm, range(5))) for perm in permutations(NAMES)]  # name -> day index
    ok = lambda p, skip=None: all(f(p) for i, f in RULES.items() if i != skip)

    full = [p for p in perms if ok(p)]
    assert len(full) == 1, f"expected 1 schedule, got {len(full)}"
    sol = full[0]
    schedule = {DAYS[d]: n for n, d in sol.items()}
    schedule = {d: schedule[d] for d in DAYS}

    counts = {i: sum(ok(p, i) for p in perms) for i in RULES}
    best = max(counts.values())
    ties = [i for i, c in counts.items() if c == best]

    for i, c in counts.items():
        print(f"Bo luat {i}: {c} hoan vi")
    print("Dong hang:", ties)

    ans = {"schedule": schedule, "count_without_rule_2": counts[2],
           "most_permissive_rule": min(ties)}
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "answer.json"), "w") as f:
        json.dump(ans, f, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
