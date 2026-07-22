"use strict";

const CACHE_VERSION = "team-bingo-v1-20260722-admin-monster-lab-42";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_FILES = [
  "./",
  "./index.html",
  "./monster-system.js",
  "./monster-battle.css",
  "./online/online-room.css",
  "./online/online-room.js",
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
  if (url.pathname === "/" || url.pathname.endsWith("firebase-config.js") || url.pathname.endsWith("index.html") || url.pathname.endsWith("monster-system.js") || url.pathname.endsWith("monster-battle.css") || url.pathname.endsWith("online-room.js") || url.pathname.endsWith("online-room.css")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isVersionedAsset(url)) event.respondWith(cacheFirst(request));
});
