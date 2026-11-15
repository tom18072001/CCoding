import json
from itertools import permutations

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
# p: dict name -> day index (Mon=0..Fri=4)
RULES = {
    1: lambda p: p["An"] not in (0, 4),
    2: lambda p: p["Binh"] == p["Chi"] + 1,
    3: lambda p: p["Dung"] < p["An"],
    4: lambda p: abs(p["Em"] - p["Binh"]) != 1,
    5: lambda p: p["Chi"] != 0,
    6: lambda p: p["Em"] != 2,
    7: lambda p: abs(p["Dung"] - p["Em"]) != 1,
}
NAMES = ["An", "Binh", "Chi", "Dung", "Em"]

allp = [dict(zip(NAMES, perm)) for perm in permutations(range(5))]
assert len(allp) == 120


def ok(p, skip=None):
    return all(f(p) for k, f in RULES.items() if k != skip)


full = [p for p in allp if ok(p)]
if len(full) != 1:
    raise SystemExit(f"STOP: {len(full)} schedules satisfy all rules")
inv = {v: k for k, v in full[0].items()}
schedule = {DAYS[i]: inv[i] for i in range(5)}
counts = {k: sum(ok(p, k) for p in allp) for k in RULES}
print("schedule:", schedule)
print("count_without_rule_2:", counts[2])
print("count when dropping each rule:")
for k, c in counts.items():
    print(f"  rule {k}: {c}")
mx = max(counts.values())
best = [k for k, c in counts.items() if c == mx]
if len(best) != 1:
    raise SystemExit(f"STOP: tie for most permissive rule: {best}")
with open("answer.json", "w") as f:
    json.dump({"schedule": schedule, "count_without_rule_2": counts[2],
               "most_permissive_rule": best[0]}, f, indent=2)
    f.write("\n")
print("wrote answer.json; most_permissive_rule =", best[0])
