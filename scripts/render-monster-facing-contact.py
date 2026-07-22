from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "monster-audit"


def grid_from_size(value: str) -> tuple[int, int]:
    values = [float(item) for item in re.findall(r"([0-9.]+)%", value or "")]
    return (max(1, round(values[0] / 100)), max(1, round(values[1] / 100))) if len(values) >= 2 else (1, 1)


def slot_from_position(value: str, columns: int, rows: int) -> tuple[int, int]:
    values = [float(item) for item in re.findall(r"(-?[0-9.]+)%", value or "")]
    if len(values) < 2:
        return 0, 0
    return round(values[0] / 100 * max(0, columns - 1)), round(values[1] / 100 * max(0, rows - 1))


def load_nodes() -> dict:
    path = ROOT / "monster-system.js"
    script = (
        "const fs=require('fs');const vm=require('vm');const c={window:{}};vm.createContext(c);"
        f"vm.runInContext(fs.readFileSync({json.dumps(str(path))},'utf8'),c);"
        "process.stdout.write(JSON.stringify(c.window.TeamBingoMonsterSystem.NODES));"
    )
    result = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(result.stdout)


def extract(node: dict) -> Image.Image:
    sprite = node["sprite"]
    with Image.open(ROOT / sprite["sheet"]) as source:
        columns, rows = grid_from_size(sprite["size"])
        x, y = slot_from_position(sprite["position"], columns, rows)
        bounds = (
            round(source.width * x / columns), round(source.height * y / rows),
            round(source.width * (x + 1) / columns), round(source.height * (y + 1) / rows),
        )
        image = source.convert("RGBA").crop(bounds)
    image.thumbnail((178, 150), Image.Resampling.LANCZOS)
    return image


def main() -> None:
    nodes = load_nodes()
    lineages = sorted({node["lineage"] for node in nodes.values() if 3 <= node["stage"] <= 5 and not node.get("legendary")})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    for page, start in enumerate(range(0, len(lineages), 8), 1):
        selected = lineages[start:start + 8]
        canvas = Image.new("RGB", (7 * 190, len(selected) * 190), "#111722")
        draw = ImageDraw.Draw(canvas)
        for row, lineage in enumerate(selected):
            lineup = sorted(
                [node for node in nodes.values() if node["lineage"] == lineage and 3 <= node["stage"] <= 5],
                key=lambda node: (node["stage"], node["id"]),
            )
            for column, node in enumerate(lineup):
                left, top = column * 190, row * 190
                art = extract(node)
                canvas.paste(art, (left + (190 - art.width) // 2, top + 5 + (150 - art.height) // 2), art)
                draw.text((left + 4, top + 158), node["id"].replace(f"{lineage}-", ""), fill="white", font=font)
                draw.text((left + 4, top + 174), f"native:{node['sprite'].get('facing', 'left')}", fill="#ffd45b", font=font)
        canvas.save(OUTPUT / f"facing-{page}.png")


if __name__ == "__main__":
    main()
