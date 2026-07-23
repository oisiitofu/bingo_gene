import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["images", "audio"];
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const audioExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac"]);
const ignoredDirectories = new Set(["v3-source"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : walk(path);
    return [path];
  }));
  return files.flat();
}

const assets = [];
for (const folder of roots) {
  for (const file of await walk(resolve(root, folder))) {
    const extension = extname(file).toLowerCase();
    const type = imageExtensions.has(extension) ? "image" : (audioExtensions.has(extension) ? "audio" : "other");
    if (type === "other") continue;
    const info = await stat(file);
    const path = relative(root, file).replaceAll("\\", "/");
    assets.push({
      path,
      type,
      category: path.split("/").slice(0, -1).join("/"),
      bytes: info.size
    });
  }
}

assets.sort((a, b) => a.path.localeCompare(b.path, "en"));
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  totals: {
    all: assets.length,
    images: assets.filter((asset) => asset.type === "image").length,
    audio: assets.filter((asset) => asset.type === "audio").length,
    bytes: assets.reduce((total, asset) => total + asset.bytes, 0)
  },
  assets
};

await mkdir(resolve(root, "assets"), { recursive: true });
await writeFile(resolve(root, "assets", "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Asset manifest: ${manifest.totals.all} files`);
