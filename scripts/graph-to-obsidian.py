#!/usr/bin/env python3
"""Convert graphify-out/graph.json into Obsidian stub notes so the vault's
Graph view renders the real code graph (like graph.html).

Includes every src/ node that participates in at least one non-`contains`
edge; emits one tiny note per node with wikilinks per outbound edge.
"""
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

GRAPH = Path("/Users/alam/Desktop/eia/graphify-out/graph.json")
VAULT = Path("/Users/alam/Desktop/Eia Vault")
OUT = VAULT / "06 🕸 Code Graph"

LAYER_RULES = [
    ("src/lib/actions/", "actions"),
    ("src/lib/services/", "services"),
    ("src/lib/supabase/", "supabase"),
    ("src/lib/validations/", "validations"),
    ("src/lib/constants/", "constants"),
    ("src/lib/utils/", "utils"),
    ("src/lib/types/", "types"),
    ("src/lib/", "lib"),
    ("src/hooks/", "hooks"),
    ("src/components/ui/", "ui"),
    ("src/components/", "components"),
    ("src/app/api/", "api"),
    ("src/app/", "app"),
    ("src/trigger/", "trigger"),
    ("src/styles/", "styles"),
    ("src/", "misc"),
]


def layer_of(src: str) -> str:
    for prefix, layer in LAYER_RULES:
        if src.startswith(prefix):
            return layer
    return "misc"


def sanitize(name: str) -> str:
    # Obsidian-forbidden filename chars
    return re.sub(r'[\\/:#^\[\]|*?"<>]', "·", name).strip()


def main() -> None:
    g = json.loads(GRAPH.read_text())
    nodes = {n["id"]: n for n in g["nodes"]}
    src_ids = {
        i for i, n in nodes.items() if (n.get("source_file") or "").startswith("src/")
    }

    edges = [
        l
        for l in g["links"]
        if l["relation"] != "contains"
        and l["source"] in src_ids
        and l["target"] in src_ids
    ]
    connected = {l["source"] for l in edges} | {l["target"] for l in edges}

    # Unique, readable note names; disambiguate duplicate labels by file stem/dir
    names: dict[str, str] = {}
    used: set[str] = set()
    reserved = {p.stem for p in VAULT.rglob("*.md")}
    for nid in sorted(connected, key=lambda i: nodes[i]["label"]):
        n = nodes[nid]
        base = sanitize(n["label"])
        cand = base
        if cand in used or cand in reserved:
            parts = Path(n.get("source_file") or "x").parts
            hint = parts[-2] if len(parts) > 1 else "src"
            cand = f"{base} ({sanitize(hint)})"
        k = 2
        while cand in used or cand in reserved:
            cand = f"{base} ({k})"
            k += 1
        used.add(cand)
        names[nid] = cand

    out_edges: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    in_count: dict[str, int] = defaultdict(int)
    for l in edges:
        tgt = names[l["target"]]
        if tgt not in out_edges[l["source"]][l["relation"]]:
            out_edges[l["source"]][l["relation"]].append(tgt)
        in_count[l["target"]] += 1

    if OUT.exists():
        shutil.rmtree(OUT)

    for nid in connected:
        n = nodes[nid]
        src = n.get("source_file") or ""
        layer = layer_of(src)
        folder = OUT / layer
        folder.mkdir(parents=True, exist_ok=True)
        is_file = "." in n["label"] and "(" not in n["label"]
        kind = "file" if is_file else "symbol"
        lines = [
            "---",
            f"tags: [code, {layer}, {kind}]",
            f"community: {n.get('community', '')}",
            f"source: \"{src}{'#' + str(n.get('source_location')) if n.get('source_location') else ''}\"",
            "---",
            "",
            f"`{src}` · community {n.get('community', '?')} · {in_count[nid]} inbound",
            "",
        ]
        for rel, targets in sorted(out_edges[nid].items()):
            lines.append(f"**{rel}** → " + " · ".join(f"[[{t}]]" for t in sorted(targets)))
            lines.append("")
        (folder / f"{names[nid]}.md").write_text("\n".join(lines))

    print(f"wrote {len(connected)} notes, {len(edges)} edges → {OUT}")
    by_layer = defaultdict(int)
    for nid in connected:
        by_layer[layer_of(nodes[nid].get("source_file") or "")] += 1
    for k, v in sorted(by_layer.items(), key=lambda x: -x[1]):
        print(f"  {k:12} {v}")


if __name__ == "__main__":
    main()
