import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "images", "tower", "bosses");
fs.mkdirSync(output, { recursive: true });

const domains = [
  ["#d9a441", "#5c301e", "#ffe5a0"], ["#70d45c", "#174b2b", "#caff9d"],
  ["#41c7e8", "#123d79", "#b8f5ff"], ["#ff6a2a", "#7d1010", "#ffd35a"],
  ["#ffe14b", "#5140b8", "#fff8b0"], ["#bff6ff", "#387fc4", "#ffffff"],
  ["#bd66ff", "#26143d", "#ff9cf1"], ["#ffed91", "#4856b7", "#ffffff"],
  ["#fff4c4", "#b58a2b", "#fffef2"], ["#ff496d", "#190a24", "#b45cff"]
];

const forms = ["wolf", "bird", "crab", "dragon", "fox", "ogre", "serpent", "chimera", "guardian", "emperor"];

function points(count, outer, inner, cx = 256, cy = 256, offset = -Math.PI / 2) {
  return Array.from({ length: count * 2 }, (_, index) => {
    const radius = index % 2 ? inner : outer;
    const angle = offset + Math.PI * index / count;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
}

function body(form, primary, dark, glow, floor) {
  const crest = 5 + floor % 7;
  const horn = 52 + floor % 31;
  const eye = floor % 2 ? "#fffb9e" : "#9effff";
  const common = `<ellipse cx="256" cy="286" rx="112" ry="126" fill="url(#armor)" stroke="${glow}" stroke-width="8"/>
    <path d="M182 267 Q256 ${190 - floor % 28} 330 267 L308 350 Q256 390 204 350Z" fill="${dark}" opacity=".72"/>
    <circle cx="218" cy="272" r="13" fill="${eye}"/><circle cx="294" cy="272" r="13" fill="${eye}"/>
    <path d="M222 326 Q256 348 290 326" fill="none" stroke="${glow}" stroke-width="9" stroke-linecap="round"/>`;
  if (form === "bird") return `<path d="M205 280 Q75 170 52 310 Q140 270 185 350Z" fill="url(#wing)"/><path d="M307 280 Q437 170 460 310 Q372 270 327 350Z" fill="url(#wing)"/>${common}<path d="M225 160 L256 58 L287 160Z" fill="${glow}"/>`;
  if (form === "crab") return `<path d="M166 250 Q65 170 52 252 Q80 308 172 315Z" fill="url(#armor)"/><path d="M346 250 Q447 170 460 252 Q432 308 340 315Z" fill="url(#armor)"/>${common}<path d="M160 350 L82 422 M352 350 L430 422" stroke="${primary}" stroke-width="25" stroke-linecap="round"/>`;
  if (form === "dragon") return `<path d="M174 240 Q80 95 44 225 Q112 180 184 310Z" fill="url(#wing)"/><path d="M338 240 Q432 95 468 225 Q400 180 328 310Z" fill="url(#wing)"/>${common}<path d="M204 180 L168 ${180 - horn} L230 205 M308 180 L344 ${180 - horn} L282 205" fill="${primary}" stroke="${glow}" stroke-width="5"/>`;
  if (form === "fox") return `<path d="M196 188 L142 70 L238 164 M316 188 L370 70 L274 164" fill="url(#armor)" stroke="${glow}" stroke-width="7"/>${common}<path d="M148 347 Q36 404 108 466 Q181 448 206 366 M364 347 Q476 404 404 466 Q331 448 306 366" fill="url(#wing)"/>`;
  if (form === "ogre") return `<path d="M174 202 L124 78 L226 172 M338 202 L388 78 L286 172" fill="${dark}" stroke="${glow}" stroke-width="8"/>${common}<rect x="72" y="250" width="99" height="155" rx="42" fill="url(#armor)"/><rect x="341" y="250" width="99" height="155" rx="42" fill="url(#armor)"/>`;
  if (form === "serpent") return `<path d="M256 438 C90 430 104 298 214 296 C332 294 366 192 254 142 C175 106 194 48 279 51 C409 57 442 230 338 315 C280 363 330 408 404 386" fill="none" stroke="url(#armor)" stroke-width="74" stroke-linecap="round"/><circle cx="272" cy="91" r="17" fill="${eye}"/><path d="M300 74 L363 43 L326 112Z" fill="${primary}"/>`;
  if (form === "chimera") return `<path d="M176 243 Q70 120 48 272 L182 330 M336 243 Q442 120 464 272 L330 330" fill="url(#wing)"/>${common}<circle cx="151" cy="203" r="61" fill="url(#armor)"/><circle cx="361" cy="203" r="61" fill="url(#armor)"/>`;
  if (form === "guardian") return `<polygon points="${points(crest, 203, 150)}" fill="url(#wing)" opacity=".82"/>${common}<path d="M256 58 L292 135 L378 148 L316 207 L331 291 L256 251 L181 291 L196 207 L134 148 L220 135Z" fill="none" stroke="${glow}" stroke-width="9"/>`;
  if (form === "emperor") return `<path d="M128 180 L170 55 L224 132 L256 28 L288 132 L342 55 L384 180Z" fill="url(#armor)" stroke="${glow}" stroke-width="9"/>${common}<path d="M128 384 Q256 466 384 384" fill="none" stroke="${primary}" stroke-width="42"/>`;
  return `<path d="M194 188 L146 ${80 - floor % 26} L236 165 M318 188 L366 ${80 - floor % 26} L276 165" fill="url(#armor)" stroke="${glow}" stroke-width="7"/>${common}<path d="M176 340 L108 441 M336 340 L404 441" stroke="${primary}" stroke-width="31" stroke-linecap="round"/>`;
}

for (let floor = 1; floor <= 100; floor += 1) {
  const [primary, dark, glow] = domains[Math.floor((floor - 1) / 10)];
  const form = forms[(floor - 1) % 10];
  const runeCount = 4 + floor % 7;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Tower boss ${floor}">
  <defs>
    <linearGradient id="armor" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${glow}"/><stop offset=".38" stop-color="${primary}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <radialGradient id="wing"><stop stop-color="${primary}" stop-opacity=".95"/><stop offset="1" stop-color="${dark}" stop-opacity=".35"/></radialGradient>
    <filter id="aura" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="12" flood-opacity=".75"/></filter>
  </defs>
  <ellipse cx="256" cy="449" rx="173" ry="28" fill="#000" opacity=".48"/>
  <g opacity=".55" filter="url(#aura)"><polygon points="${points(runeCount, 218, 196)}" fill="none" stroke="${primary}" stroke-width="5"/></g>
  <g filter="url(#shadow)">${body(form, primary, dark, glow, floor)}</g>
  <g fill="${glow}" opacity=".86">${Array.from({ length: Math.min(12, 3 + Math.floor(floor / 10)) }, (_, i) => { const a = (i * 2.4 + floor) * .73; const r = 174 + (i % 3) * 18; return `<circle cx="${256 + Math.cos(a) * r}" cy="${256 + Math.sin(a) * r}" r="${3 + i % 4}"/>`; }).join("")}</g>
  <path d="M36 470 H476" stroke="${primary}" stroke-width="4" opacity=".7"/>
</svg>`;
  fs.writeFileSync(path.join(output, `boss-${String(floor).padStart(3, "0")}.svg`), svg);
}

console.log(`Generated 100 isolated tower boss assets in ${output}`);
