"""S2 crosscheck: dung pos[name] (0=Mon..4=Fri) + itertools.product loc trung."""
import itertools
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
N = ["An", "Binh", "Chi", "Dung", "Em"]
RULES = {
    1: lambda p: p["An"] not in (0, 4),
    2: lambda p: p["Binh"] == p["Chi"] + 1,
    3: lambda p: p["Dung"] < p["An"],
    4: lambda p: abs(p["Em"] - p["Binh"]) != 1,
    5: lambda p: p["Chi"] != 0,
    6: lambda p: p["Em"] != 2,
    7: lambda p: abs(p["Dung"] - p["Em"]) != 1,
}
def sols(skip=None):
    out = []
    for t in itertools.product(range(5), repeat=5):
        if len(set(t)) < 5:
            continue
        p = dict(zip(N, t))
        if all(f(p) for r, f in RULES.items() if r != skip):
            out.append(p)
    return out
full = sols()
assert len(full) == 1, len(full)
sched = {DAYS[v]: k for k, v in full[0].items()}
counts = {r: len(sols(r)) for r in RULES}
m = max(counts.values())
best = [r for r, c in counts.items() if c == m]
print("schedule:", sched)
print("count_without_rule_2:", counts[2])
for r in RULES: print(f"  bo rule {r}: {counts[r]}")
print("most_permissive_rule:", best[0], "(dong hang!)" if len(best) > 1 else "(duy nhat)", best)
