from __future__ import annotations

import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SYSTEM = ROOT / "monster-system.js"


def load_nodes() -> dict:
    script = (
        "const fs=require('fs');const vm=require('vm');"
        "const c={window:{}};vm.createContext(c);"
        f"vm.runInContext(fs.readFileSync({json.dumps(str(SYSTEM))},'utf8'),c);"
        "process.stdout.write(JSON.stringify(c.window.TeamBingoMonsterSystem.NODES));"
    )
    result = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(result.stdout)


def grid_from_size(value: str) -> tuple[int, int]:
    values = [float(item) for item in re.findall(r"([0-9.]+)%", value or "")]
    if len(values) < 2:
        return 1, 1
    return max(1, round(values[0] / 100)), max(1, round(values[1] / 100))


def crop_origin_from_position(value: str, width: int, height: int, columns: int, rows: int) -> tuple[int, int]:
    values = [float(item) for item in re.findall(r"(-?[0-9.]+)%", value or "")]
    if len(values) < 2:
        return 0, 0
    cell_width = width / columns
    cell_height = height / rows
    x = round(values[0] / 100 * (width - cell_width))
    y = round(values[1] / 100 * (height - cell_height))
    return max(0, min(round(width - cell_width), x)), max(0, min(round(height - cell_height), y))


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    return image.getchannel("A").point(lambda value: 255 if value >= 12 else 0).getbbox()


def main() -> None:
    nodes = load_nodes()
    report = []
    sheet_summary = defaultdict(lambda: {"nodes": 0, "touching": 0, "low_resolution": 0})
    for node_id, node in nodes.items():
        sprite = node.get("sprite") or {}
        path = ROOT / sprite.get("sheet", "")
        with Image.open(path) as source:
            columns, rows = grid_from_size(sprite.get("size", ""))
            left, top = crop_origin_from_position(
                sprite.get("position", ""), source.width, source.height, columns, rows
            )
            right = left + round(source.width / columns)
            bottom = top + round(source.height / rows)
            cell = source.convert("RGBA").crop((left, top, right, bottom))
            bbox = alpha_bbox(cell)
            margins = None
            touching = False
            if bbox:
                margins = [bbox[0], bbox[1], cell.width - bbox[2], cell.height - bbox[3]]
                touching = min(margins) < 3
            low_resolution = min(cell.size) < 400
            relative = path.relative_to(ROOT).as_posix()
            report.append({
                "node": node_id,
                "sheet": relative,
                "origin": [left, top],
                "cell": list(cell.size),
                "margins": margins,
                "touching": touching,
                "lowResolution": low_resolution,
                "facing": sprite.get("facing", "left"),
            })
            sheet_summary[relative]["nodes"] += 1
            sheet_summary[relative]["touching"] += int(touching)
            sheet_summary[relative]["low_resolution"] += int(low_resolution)

    output = {
        "nodes": len(report),
        "touching": sum(item["touching"] for item in report),
        "lowResolution": sum(item["lowResolution"] for item in report),
        "sheets": dict(sorted(sheet_summary.items())),
        "issues": [item for item in report if item["touching"] or item["lowResolution"]],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
