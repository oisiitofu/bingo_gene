from __future__ import annotations

import json
import subprocess
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "monster-pose-bounds.js"
ALPHA_THRESHOLD = 18


NODE_SCRIPT = r"""
const fs = require("fs");
const vm = require("vm");
const context = {};
context.window = context;
context.globalThis = context;
vm.runInNewContext(fs.readFileSync("monster-system.js", "utf8"), context);
const nodes = Object.values(context.TeamBingoMonsterSystem.NODES).map((node) => ({
  id: node.id,
  aspect: Number(node.sprite.aspect) || 1,
  size: node.sprite.size,
  position: node.sprite.position,
  sheet: node.sprite.sheet,
  attackSheet: node.sprite.attackSheet || "",
  poseMatched: Boolean(node.sprite.poseMatched)
}));
process.stdout.write(JSON.stringify(nodes));
"""


def load_nodes() -> list[dict]:
    result = subprocess.run(
        ["node", "-e", NODE_SCRIPT],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(result.stdout)


def matched_attack_sheet(node: dict) -> str:
    base = node["sheet"]
    attack = node["attackSheet"]
    if attack and attack != base and (node["poseMatched"] or "/pairs/" in base):
        return attack
    if not attack and "/rank6-singles/" not in base:
        return base.removesuffix(".png") + "-attack.png"
    return ""


def visible_bounds(node: dict, source: str) -> list[int] | None:
    path = ROOT / source
    if not path.exists():
        return None
    with Image.open(path).convert("RGBA") as image:
        width, height = image.size
        paired = str(node["size"]).startswith("200%")
        slot = 1 if paired and str(node["position"]).strip().startswith("100%") else 0
        left = width // 2 * slot if paired else 0
        right = width if not paired or slot else width // 2
        crop = image.crop((left, 0, right, height))
        alpha = crop.getchannel("A").point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
        bounds = alpha.getbbox()
        if not bounds:
            return None

        crop_width, crop_height = crop.size
        viewport_width = max(100, round(float(node["aspect"]) * 1000))
        viewport_height = 1000
        x0, y0, x1, y1 = bounds
        if paired:
            scale_x = viewport_width / crop_width
            scale_y = viewport_height / crop_height
            offset_x = 0
            offset_y = 0
        else:
            scale_x = scale_y = min(viewport_width / crop_width, viewport_height / crop_height)
            offset_x = (viewport_width - crop_width * scale_x) / 2
            offset_y = (viewport_height - crop_height * scale_y) / 2

        mapped_x = offset_x + x0 * scale_x
        mapped_y = offset_y + y0 * scale_y
        mapped_width = max(1, (x1 - x0) * scale_x)
        mapped_height = max(1, (y1 - y0) * scale_y)
        return [
            round(mapped_x),
            round(mapped_y),
            round(mapped_width),
            round(mapped_height),
        ]


def generate() -> None:
    output: dict[str, dict[str, list[int]]] = {}
    for node in load_nodes():
        poses: dict[str, list[int]] = {}
        base = visible_bounds(node, node["sheet"])
        if base:
            poses["base"] = base
        attack_source = matched_attack_sheet(node)
        attack = visible_bounds(node, attack_source) if attack_source else None
        if attack:
            poses["attack"] = attack
        if poses:
            output[node["id"]] = poses

    payload = json.dumps(output, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    OUTPUT.write_text(
        "(function(global){\n"
        '  "use strict";\n'
        f"  global.TeamBingoMonsterPoseBounds = Object.freeze({payload});\n"
        '})(typeof window !== "undefined" ? window : globalThis);\n',
        encoding="utf-8",
    )
    print(f"Generated {OUTPUT.name}: {len(output)} monsters")


if __name__ == "__main__":
    generate()
