import json
from itertools import permutations

P = ["An", "Binh", "Chi", "Dung", "Em"]
D = ["Mon", "Tue", "Wed", "Thu", "Fri"]

RULES = {
    1: lambda p: p["An"] not in (0, 4),
    2: lambda p: p["Binh"] == p["Chi"] + 1,
    3: lambda p: p["Dung"] < p["An"],
    4: lambda p: abs(p["Em"] - p["Binh"]) != 1,
    5: lambda p: p["Chi"] != 0,
    6: lambda p: p["Em"] != 2,
    7: lambda p: abs(p["Dung"] - p["Em"]) != 1,
}

def rotas(skip=None):
    for perm in permutations(range(5)):
        p = dict(zip(P, perm))
        if all(f(p) for k, f in RULES.items() if k != skip):
            yield p

if __name__ == "__main__":
    full = list(rotas())
    assert len(full) == 1, len(full)
    sol = full[0]
    inv = {v: k for k, v in sol.items()}
    counts = {k: sum(1 for _ in rotas(k)) for k in RULES}
    for k, c in counts.items():
        print(f"bo luat {k}: {c}")
    best = max(counts.values())
    winners = [k for k, c in counts.items() if c == best]
    print("max:", best, "luat:", winners)
    ans = {"schedule": {D[i]: inv[i] for i in range(5)},
           "count_without_rule_2": counts[2],
           "most_permissive_rule": winners[0]}
    with open("answer.json", "w") as f:
        json.dump(ans, f, indent=2)
