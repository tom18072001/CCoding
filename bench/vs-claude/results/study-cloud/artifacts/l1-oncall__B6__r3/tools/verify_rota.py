"""Kiểm chứng độc lập: backtracking có cắt nhánh theo luật (không dùng permutations)."""
import json
P = ["An", "Binh", "Chi", "Dung", "Em"]
D = ["Mon", "Tue", "Wed", "Thu", "Fri"]

# pos: dict người -> chỉ số ngày 0..4. Mỗi luật chỉ kiểm khi đủ biến liên quan.
RULES = {
    1: lambda p: p["An"] not in (0, 4),
    2: lambda p: p["Binh"] == p["Chi"] + 1,
    3: lambda p: p["Dung"] < p["An"],
    4: lambda p: abs(p["Em"] - p["Binh"]) != 1,
    5: lambda p: p["Chi"] != 0,
    6: lambda p: p["Em"] != 2,
    7: lambda p: abs(p["Dung"] - p["Em"]) != 1,
}

def solve(skip=None):
    active = [f for k, f in RULES.items() if k != skip]
    out = []
    def rec(i, pos, used):
        if i == 5:
            if all(f(pos) for f in active):
                out.append(dict(pos))
            return
        for d in range(5):
            if d not in used:
                pos[P[i]] = d
                rec(i + 1, pos, used | {d})
                del pos[P[i]]
    rec(0, {}, frozenset())
    return out

def sched(p):
    return {D[d]: n for n, d in p.items() for _ in [0]} if False else {D[d]: n for n, d in sorted(p.items(), key=lambda x: x[1])}

if __name__ == "__main__":
    full = solve()
    print("Số rota thoả cả 7 luật:", len(full))
    for s in full:
        print("Nghiệm:", json.dumps(sched(s)))
    c2 = len(solve(2))
    print("count_without_rule_2:", c2)
    counts = {k: len(solve(k)) for k in RULES}
    for k, v in counts.items():
        print(f"Bỏ luật {k}: {v}")
    m = max(counts.values())
    best = [k for k, v in counts.items() if v == m]
    print("most_permissive_rule:", best[0] if len(best) == 1 else f"HOÀ giữa {best}", f"(max={m})")
