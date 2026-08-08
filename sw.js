"use strict";

const CACHE_VERSION = "team-bingo-v1-20260808-bgm-resume-107";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_FILES = [
  "./",
  "./index.html",
  "./monster-system.js",
  "./territory-equipment.js",
  "./territory-system.js",
  "./vendor/three/three.min.js",
  "./territory-map-3d.js",
  "./territory-mode.js",
  "./territory-mode.css",
  "./world-tournament.js",
  "./world-tournament.css",
  "./monster-page.css",
  "./monster-battle.css",
  "./online/online-room.css",
  "./online/online-room.js",
  "./images/territory/strategy-map-backdrop-v2.png",
  "./images/territory/textures/stone-wall.png",
  "./images/territory/textures/roof-tiles.png",
  "./images/territory/textures/aged-wood.png",
  "./images/territory/textures/terrain-ground-v2.png",
  "./images/territory/textures/volcanic-basalt-v2.png",
  "./images/territory/textures/molten-lava-v2.png",
  "./images/territory/textures/evergreen-foliage-v2.png",
  "./images/territory/textures/ancient-stone-v2.png",
  "./images/monster-battle/arena.png",
  "./images/ui/team-bingo-logo.png",
  "./images/ui/bg-arena-stage.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isVersionedAsset(url) {
  return /\.(?:png|jpe?g|webp|svg|mp3|wav|ogg)$/i.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok && !request.url.includes("firebase-config.js")) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/audio/monster-battle/boss-bgm/")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.includes("/audio/territory/bgm/")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname === "/" || url.pathname.endsWith("firebase-config.js") || url.pathname.endsWith("index.html") || url.pathname.endsWith("monster-system.js") || url.pathname.endsWith("territory-equipment.js") || url.pathname.endsWith("territory-system.js") || url.pathname.endsWith("territory-mode.js") || url.pathname.endsWith("territory-mode.css") || url.pathname.endsWith("world-tournament.js") || url.pathname.endsWith("world-tournament.css") || url.pathname.endsWith("monster-page.css") || url.pathname.endsWith("monster-battle.css") || url.pathname.endsWith("online-room.js") || url.pathname.endsWith("online-room.css")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isVersionedAsset(url)) event.respondWith(cacheFirst(request));
});
