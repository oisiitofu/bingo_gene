from __future__ import annotations

import argparse
import json
import importlib.util
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SYSTEM = ROOT / "monster-system.js"
OUTPUT = ROOT / "images" / "monsters" / "pairs"
MANIFEST = ROOT / "assets" / "monster-pair-manifest.json"
CELL_SIZE = 768
CELL_PADDING = 52

OPTIMIZER_SPEC = importlib.util.spec_from_file_location(
    "optimize_monster_assets", Path(__file__).with_name("optimize-monster-assets.py")
)
if OPTIMIZER_SPEC is None or OPTIMIZER_SPEC.loader is None:
    raise RuntimeError("Unable to load optimize-monster-assets.py")
OPTIMIZER = importlib.util.module_from_spec(OPTIMIZER_SPEC)
OPTIMIZER_SPEC.loader.exec_module(OPTIMIZER)
normalized_cell = OPTIMIZER.normalized_cell


def load_nodes(revision: str = "") -> dict:
    source_loader = (
        f"require('child_process').execFileSync('git',['show',{json.dumps(f'{revision}:monster-system.js')}],"
        "{encoding:'utf8'})"
        if revision
        else f"fs.readFileSync({json.dumps(str(SYSTEM))},'utf8')"
    )
    script = (
        "const fs=require('fs');const vm=require('vm');"
        "const c={window:{}};vm.createContext(c);"
        f"vm.runInContext({source_loader},c);"
        "process.stdout.write(JSON.stringify(c.window.TeamBingoMonsterSystem.NODES));"
    )
    result = subprocess.run(
        ["node", "-e", script], check=True, capture_output=True, text=True, encoding="utf-8"
    )
    return json.loads(result.stdout)


def grid_from_size(value: str) -> tuple[int, int]:
    values = [float(item) for item in re.findall(r"([0-9.]+)%", value or "")]
    if len(values) < 2:
        return 1, 1
    return max(1, round(values[0] / 100)), max(1, round(values[1] / 100))


def crop_origin(value: str, width: int, height: int, columns: int, rows: int) -> tuple[int, int]:
    values = [float(item) for item in re.findall(r"(-?[0-9.]+)%", value or "")]
    if len(values) < 2:
        return 0, 0
    cell_width = width / columns
    cell_height = height / rows
    left = round(values[0] / 100 * (width - cell_width))
    top = round(values[1] / 100 * (height - cell_height))
    return (
        max(0, min(round(width - cell_width), left)),
        max(0, min(round(height - cell_height), top)),
    )


def crop_sprite(source: Image.Image, sprite: dict) -> Image.Image:
    columns, rows = grid_from_size(sprite.get("size", ""))
    left, top = crop_origin(sprite.get("position", ""), source.width, source.height, columns, rows)
    right = left + round(source.width / columns)
    bottom = top + round(source.height / rows)
    return source.crop((left, top, right, bottom))


def attack_path(base_path: Path) -> Path:
    candidate = base_path.with_name(f"{base_path.stem}-attack{base_path.suffix}")
    if not candidate.exists():
        raise FileNotFoundError(f"Attack artwork is missing for {base_path.relative_to(ROOT)}")
    return candidate


def source_path(sheet: str) -> Path:
    primary = ROOT / sheet
    if primary.exists():
        return primary
    archived = ROOT / "images" / "monsters" / "v3-source" / Path(sheet).name
    if archived.exists():
        return archived
    raise FileNotFoundError(f"Source artwork is missing for {sheet}")


def normalized_sprite(source: Image.Image, sprite: dict) -> Image.Image:
    cell = crop_sprite(source, sprite)
    output = normalized_cell(
        cell,
        CELL_SIZE,
        CELL_SIZE,
        CELL_PADDING,
        clear_edge=3,
        isolate_subject=True,
    )
    if min(cell.size) < 620:
        output = output.filter(ImageFilter.UnsharpMask(radius=1.05, percent=62, threshold=3))
    return output


def output_name(source_path: Path, pair_index: int, attack: bool = False) -> str:
    suffix = "-attack" if attack else ""
    return f"{source_path.stem}-{pair_index + 1:02d}{suffix}.png"


def main() -> None:
    parser = argparse.ArgumentParser(description="Repack crowded monster atlases into one-or-two-monster sheets.")
    parser.add_argument("--source-revision", default="", help="Read the pre-migration monster-system.js from a git revision.")
    parser.add_argument("--layout-only", action="store_true", help="Only add source sprite layouts to the existing manifest.")
    args = parser.parse_args()
    nodes = load_nodes(args.source_revision)
    if args.layout_only:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for node_id, entry in manifest.get("nodes", {}).items():
            if node_id in nodes:
                entry["sourceSprite"] = nodes[node_id]["sprite"]
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Saved {len(manifest.get('nodes', {}))} source sprite layouts.")
        return
    groups: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for node_id, node in nodes.items():
        groups[node["sprite"]["sheet"]].append((node_id, node))

    crowded = {sheet: members for sheet, members in groups.items() if len(members) > 2}
    if not crowded and MANIFEST.exists():
        previous_manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for node_id, entry in previous_manifest.get("nodes", {}).items():
            sprite = entry.get("sourceSprite")
            if sprite:
                groups[sprite["sheet"]].append((node_id, {"sprite": sprite}))
        crowded = {sheet: members for sheet, members in groups.items() if len(members) > 2}
    if not crowded:
        raise RuntimeError("No crowded source sheets or saved source layouts were found.")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    manifest = {"version": 1, "cellSize": CELL_SIZE, "sheets": [], "nodes": {}}
    for sheet, members in sorted(crowded.items()):
        base_source_path = source_path(sheet)
        attack_source_path = attack_path(base_source_path)
        with Image.open(base_source_path) as base_source_file, Image.open(attack_source_path) as attack_source_file:
            base_source = base_source_file.convert("RGBA")
            attack_source = attack_source_file.convert("RGBA")
            for start in range(0, len(members), 2):
                pair = members[start:start + 2]
                pair_index = start // 2
                base_file = output_name(base_source_path, pair_index)
                attack_file = output_name(base_source_path, pair_index, attack=True)
                base_canvas = Image.new("RGBA", (CELL_SIZE * len(pair), CELL_SIZE))
                attack_canvas = Image.new("RGBA", (CELL_SIZE * len(pair), CELL_SIZE))
                node_ids = []
                for slot, (node_id, node) in enumerate(pair):
                    sprite = node["sprite"]
                    base_canvas.alpha_composite(normalized_sprite(base_source, sprite), (slot * CELL_SIZE, 0))
                    attack_canvas.alpha_composite(normalized_sprite(attack_source, sprite), (slot * CELL_SIZE, 0))
                    node_ids.append(node_id)
                    manifest["nodes"][node_id] = {
                        "sheet": f"images/monsters/pairs/{base_file}",
                        "attackSheet": f"images/monsters/pairs/{attack_file}",
                        "slot": slot,
                        "count": len(pair),
                        "sourceSprite": sprite,
                    }
                base_canvas.save(OUTPUT / base_file, optimize=True)
                attack_canvas.save(OUTPUT / attack_file, optimize=True)
                manifest["sheets"].append({
                    "source": sheet,
                    "sheet": f"images/monsters/pairs/{base_file}",
                    "attackSheet": f"images/monsters/pairs/{attack_file}",
                    "nodes": node_ids,
                })

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Repacked {len(manifest['nodes'])} monsters from {len(crowded)} crowded sheets "
        f"into {len(manifest['sheets'])} one-or-two-monster sheets."
    )


if __name__ == "__main__":
    main()
