from __future__ import annotations

import json
import re
import subprocess
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]


def fade_cell_edges(image: Image.Image, ratio: float = .035) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    fade_x = max(2, round(width * ratio))
    fade_y = max(2, round(height * ratio))
    mask = Image.new("L", rgba.size, 255)
    draw = ImageDraw.Draw(mask)
    for offset in range(fade_x):
        value = round(255 * offset / fade_x)
        draw.line((offset, 0, offset, height), fill=value)
        draw.line((width - 1 - offset, 0, width - 1 - offset, height), fill=value)
    for offset in range(fade_y):
        value = round(255 * offset / fade_y)
        draw.line((0, offset, width, offset), fill=value)
        draw.line((0, height - 1 - offset, width, height - 1 - offset), fill=value)
    rgba.putalpha(ImageChops.multiply(alpha, mask))
    return rgba


def transparent_black(image: Image.Image, threshold: int = 8) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, alpha in rgba.getdata():
        brightness = max(red, green, blue)
        if brightness <= threshold:
            pixels.append((red, green, blue, 0))
        else:
            edge_alpha = min(alpha, round(255 * min(1, (brightness - threshold) / 18)))
            pixels.append((red, green, blue, edge_alpha))
    rgba.putdata(pixels)
    return rgba


def keep_subject_components(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"))
    mask = alpha >= 12
    seen = np.zeros(mask.shape, dtype=bool)
    components = []
    height, width = mask.shape
    for start_y, start_x in zip(*np.nonzero(mask & ~seen)):
        if seen[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        pixels = []
        while queue:
            y, x = queue.popleft()
            pixels.append((y, x))
            for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= next_y < height and 0 <= next_x < width and mask[next_y, next_x] and not seen[next_y, next_x]:
                    seen[next_y, next_x] = True
                    queue.append((next_y, next_x))
        components.append(pixels)
    if not components:
        return rgba
    largest = max(len(component) for component in components)
    keep = np.zeros(mask.shape, dtype=bool)
    for component in components:
        ys = [pixel[0] for pixel in component]
        xs = [pixel[1] for pixel in component]
        touches_side = min(xs) <= 2 or max(xs) >= width - 3
        if len(component) == largest or (len(component) >= largest * .018 and not touches_side):
            keep[ys, xs] = True
    output_alpha = np.where(keep, alpha, 0).astype(np.uint8)
    rgba.putalpha(Image.fromarray(output_alpha, mode="L"))
    return rgba


def normalized_cell(
    cell: Image.Image, width: int, height: int, padding: int, clear_edge: int = 2, isolate_subject: bool = False
) -> Image.Image:
    rgba = fade_cell_edges(cell)
    if isolate_subject:
        rgba = keep_subject_components(rgba)
    alpha = rgba.getchannel("A")
    if clear_edge:
        alpha.paste(0, (0, 0, rgba.width, clear_edge))
        alpha.paste(0, (0, rgba.height - clear_edge, rgba.width, rgba.height))
        alpha.paste(0, (0, 0, clear_edge, rgba.height))
        alpha.paste(0, (rgba.width - clear_edge, 0, rgba.width, rgba.height))
        rgba.putalpha(alpha)
    bounds = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if not bounds:
        return Image.new("RGBA", (width, height))
    subject = rgba.crop(bounds)
    subject.thumbnail((width - padding * 2, height - padding * 2), Image.Resampling.LANCZOS)
    if subject.width > cell.width or subject.height > cell.height:
        subject = subject.filter(ImageFilter.UnsharpMask(radius=1.2, percent=75, threshold=3))
    output = Image.new("RGBA", (width, height))
    output.alpha_composite(subject, ((width - subject.width) // 2, (height - subject.height) // 2))
    return output


def repack(
    source_path: Path, destination: Path, columns: int, rows: int, cell_width: int, cell_height: int,
    padding: int, isolate_subject: bool = False
) -> None:
    with Image.open(source_path) as source:
        source = source.convert("RGBA")
        output = Image.new("RGBA", (cell_width * columns, cell_height * rows))
        for y in range(rows):
            for x in range(columns):
                bounds = (
                    round(source.width * x / columns),
                    round(source.height * y / rows),
                    round(source.width * (x + 1) / columns),
                    round(source.height * (y + 1) / rows),
                )
                cell = normalized_cell(source.crop(bounds), cell_width, cell_height, padding, isolate_subject=isolate_subject)
                output.alpha_composite(cell, (x * cell_width, y * cell_height))
        output.save(destination, optimize=True)


def referenced_atlases() -> dict[Path, tuple[int, int]]:
    system = ROOT / "monster-system.js"
    script = (
        "const fs=require('fs');const vm=require('vm');const c={window:{}};vm.createContext(c);"
        f"vm.runInContext(fs.readFileSync({json.dumps(str(system))},'utf8'),c);"
        "process.stdout.write(JSON.stringify(c.window.TeamBingoMonsterSystem.NODES));"
    )
    result = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True, encoding="utf-8")
    nodes = json.loads(result.stdout)
    atlases = {}
    for node in nodes.values():
        sprite = node.get("sprite") or {}
        values = [float(item) for item in re.findall(r"([0-9.]+)%", sprite.get("size", ""))]
        if len(values) < 2:
            continue
        columns, rows = max(1, round(values[0] / 100)), max(1, round(values[1] / 100))
        path = ROOT / sprite["sheet"]
        position_values = [float(item) for item in re.findall(r"(-?[0-9.]+)%", sprite.get("position", ""))]
        uses_center_slice = rows > 1 and len(position_values) >= 2 and position_values[1] not in (0, 100)
        if columns > 1 and "rank6-" not in path.name and not uses_center_slice:
            atlases[path] = (columns, rows)
    return atlases


def normalize_referenced_atlases() -> None:
    for source_path, (columns, rows) in referenced_atlases().items():
        with Image.open(source_path) as source:
            cell_width = round(source.width / columns)
            cell_height = round(source.height / rows)
        temporary = source_path.with_name(f"{source_path.stem}.normalized.png")
        repack(
            source_path, temporary, columns, rows, cell_width, cell_height,
            max(5, round(min(cell_width, cell_height) * .035)), isolate_subject=True
        )
        temporary.replace(source_path)


def repack_effects(source_path: Path, destination: Path, columns: int, rows: int) -> None:
    with Image.open(source_path) as source:
        source = transparent_black(source)
        output = Image.new("RGBA", (columns * 1024, rows * 1024))
        for y in range(rows):
            for x in range(columns):
                bounds = (
                    round(source.width * x / columns),
                    round(source.height * y / rows),
                    round(source.width * (x + 1) / columns),
                    round(source.height * (y + 1) / rows),
                )
                cell = normalized_cell(source.crop(bounds), 1024, 1024, 54, clear_edge=3)
                output.alpha_composite(cell, (x * 1024, y * 1024))
        output.save(destination, optimize=True)


def main() -> None:
    monster_dir = ROOT / "images" / "monsters"
    effect_dir = ROOT / "images" / "monster-battle" / "effects"
    repack(monster_dir / "growth.png", monster_dir / "growth-v2.png", 4, 1, 768, 768, 30, isolate_subject=True)
    repack(monster_dir / "growth-extra.png", monster_dir / "growth-extra-v2.png", 4, 1, 768, 768, 30, isolate_subject=True)
    repack(monster_dir / "rank6-a.png", monster_dir / "rank6-a-v2.png", 4, 4, 768, 768, 42)
    repack(monster_dir / "rank6-b.png", monster_dir / "rank6-b-v2.png", 4, 4, 768, 768, 42)
    if (effect_dir / "elemental-generated.png").exists():
        repack_effects(effect_dir / "elemental-generated.png", effect_dir / "elemental-v2.png", 4, 2)
    if (effect_dir / "physical-generated.png").exists():
        repack_effects(effect_dir / "physical-generated.png", effect_dir / "physical-v2.png", 4, 1)
    normalize_referenced_atlases()


if __name__ == "__main__":
    main()
