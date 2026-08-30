import "../monster-system.js";
import "../territory-equipment.js";
import "../territory-system.js";
import "../city-system.js";

const Territory = globalThis.TeamBingoTerritorySystem;
const Equipment = globalThis.TeamBingoTerritoryEquipment;
const City = globalThis.TeamBingoCitySystem;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_SCOPES = [
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");
const DAILY_BACKUP_FORMAT = "team-bingo-rtdb-full-backup";
const DAILY_BACKUP_VERSION = 1;
const DAILY_BACKUP_RETENTION_SECONDS = 90 * 24 * 60 * 60;

let tokenCache = { value: "", expiresAt: 0 };

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function pemBytes(value) {
  const normalized = String(value || "").replaceAll("\\n", "\n");
  const encoded = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  if (!encoded) throw new Error("FIREBASE_PRIVATE_KEY is missing");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function createServiceJwt(env, now = Date.now()) {
  if (!env.FIREBASE_CLIENT_EMAIL) throw new Error("FIREBASE_CLIENT_EMAIL is missing");
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: TOKEN_URL,
    scope: FIREBASE_SCOPES,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64Url(signature)}`;
}

async function accessToken(env) {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  const assertion = await createServiceJwt(env);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error(`OAuth token failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  tokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000
  };
  return tokenCache.value;
}

async function firebaseIdentity(env, method, body) {
  const apiKey = String(env.FIREBASE_API_KEY || "");
  if (!apiKey) throw new Error("FIREBASE_API_KEY is missing");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${method}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Firebase ${method} failed: ${JSON.stringify(value)}`);
  return value;
}

function databaseUrl(env, path, token = "") {
  const base = String(env.FIREBASE_DATABASE_URL || "").replace(/\/+$/g, "");
  if (!base) throw new Error("FIREBASE_DATABASE_URL is missing");
  const encodedPath = String(path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const authQuery = String(env.FIREBASE_USE_AUTH_QUERY || "") === "true" && token
    ? `?auth=${encodeURIComponent(token)}`
    : "";
  return `${base}/${encodedPath}.json${authQuery}`;
}

async function readDatabase(env, path, token, withEtag = false) {
  const useAuthQuery = String(env.FIREBASE_USE_AUTH_QUERY || "") === "true";
  const response = await fetch(databaseUrl(env, path, token), {
    headers: {
      ...(!useAuthQuery ? { authorization: `Bearer ${token}` } : {}),
      ...(withEtag ? { "x-firebase-etag": "true" } : {})
    }
  });
  if (!response.ok) throw new Error(`Firebase GET ${path} failed: ${response.status} ${await response.text()}`);
  return {
    value: await response.json(),
    etag: response.headers.get("etag") || ""
  };
}

async function writeDatabase(env, path, value, token, etag = "") {
  const useAuthQuery = String(env.FIREBASE_USE_AUTH_QUERY || "") === "true";
  const response = await fetch(databaseUrl(env, path, token), {
    method: "PUT",
    headers: {
      ...(!useAuthQuery ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      ...(etag ? { "if-match": etag } : {})
    },
    body: JSON.stringify(value)
  });
  if (response.status === 412) return { committed: false, conflict: true };
  if (!response.ok) throw new Error(`Firebase PUT ${path} failed: ${response.status} ${await response.text()}`);
  return { committed: true, value: await response.json() };
}

function rootPath(env, part) {
  return [env.FIREBASE_DATABASE_ROOT || "teamBingoV1", part].filter(Boolean).join("/");
}

export function dailyBackupDate(now = Date.now()) {
  return new Date(Number(now) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function dailyBackupKeys(now = Date.now()) {
  const date = dailyBackupDate(now);
  return {
    date,
    data: `daily/${date}/teamBingoV1-${date}.json.gz`,
    marker: `markers/${date}`
  };
}

async function gzipBytes(bytes) {
  const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(compressed).arrayBuffer();
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createDailyBackupWithToken(env, token, now = Date.now()) {
  if (!env.BACKUP_STORE) return { ok: false, created: false, reason: "backup-store-unbound" };
  const keys = dailyBackupKeys(now);
  const existing = await env.BACKUP_STORE.get(keys.marker);
  if (existing) return { ok: true, created: false, reason: "already-created", key: keys.data, date: keys.date };

  const snapshot = await readDatabase(env, rootPath(env, ""), token);
  const envelope = {
    format: DAILY_BACKUP_FORMAT,
    version: DAILY_BACKUP_VERSION,
    createdAt: new Date(now).toISOString(),
    firebaseRoot: env.FIREBASE_DATABASE_ROOT || "teamBingoV1",
    data: snapshot.value || {}
  };
  const raw = new TextEncoder().encode(JSON.stringify(envelope));
  const [compressed, sha256] = await Promise.all([gzipBytes(raw), sha256Hex(raw)]);
  const marker = {
    format: DAILY_BACKUP_FORMAT,
    version: DAILY_BACKUP_VERSION,
    date: keys.date,
    createdAt: envelope.createdAt,
    key: keys.data,
    sha256,
    bytes: raw.byteLength,
    compressedBytes: compressed.byteLength
  };
  await env.BACKUP_STORE.put(keys.data, compressed, {
    expirationTtl: DAILY_BACKUP_RETENTION_SECONDS,
    metadata: marker
  });
  await env.BACKUP_STORE.put(keys.marker, JSON.stringify(marker), {
    expirationTtl: DAILY_BACKUP_RETENTION_SECONDS
  });
  return { ok: true, created: true, ...marker };
}

export async function createDailyBackup(env, now = Date.now()) {
  if (!env.BACKUP_STORE) return { ok: false, created: false, reason: "backup-store-unbound" };
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return createDailyBackupWithToken(env, await accessToken(env), now);
  }
  const account = await firebaseIdentity(env, "accounts:signUp", { returnSecureToken: true });
  const anonymousEnv = { ...env, FIREBASE_USE_AUTH_QUERY: "true" };
  try {
    return await createDailyBackupWithToken(anonymousEnv, account.idToken, now);
  } finally {
    await firebaseIdentity(env, "accounts:delete", { idToken: account.idToken }).catch(() => {});
  }
}

async function currentBackupStatus(env, now = Date.now()) {
  if (!env.BACKUP_STORE) return { configured: false, date: dailyBackupDate(now), created: false };
  const keys = dailyBackupKeys(now);
  const raw = await env.BACKUP_STORE.get(keys.marker);
  if (!raw) return { configured: true, date: keys.date, created: false };
  try {
    return { configured: true, created: true, ...JSON.parse(raw) };
  } catch {
    return { configured: true, date: keys.date, created: true, key: keys.data };
  }
}

export function buildSeasonEquipmentRewards(archive, ranking = Territory.standings(archive)) {
  const seasonId = archive?.season?.id || "";
  return Object.fromEntries(ranking.map((result, index) => {
    const count = Equipment.rewardCountForSeason(result, index + 1);
    return [result.id, {
      playerId: result.id,
      playerName: result.name,
      rank: index + 1,
      count,
      items: Equipment.generateRewards(`territory-season:${seasonId}:${result.id}:${index + 1}`, count)
    }];
  }));
}

function finalizedArchive(raw, now) {
  const archived = JSON.parse(JSON.stringify(raw));
  const ranking = Territory.standings(archived);
  const champion = ranking[0] || null;
  const alreadyComplete = archived.season?.status === "complete";
  archived.season.status = "complete";
  archived.season.championId = archived.season.championId || champion?.id || "";
  archived.season.completedAt ||= Number(archived.season.endsAt) || Number(now);
  if (!alreadyComplete && champion && archived.players?.[champion.id]) {
    archived.players[champion.id].championCount = (Number(archived.players[champion.id].championCount) || 0) + 1;
  }
  archived.finalStandings = ranking.map((player, index) => ({
    rank: index + 1,
    id: player.id,
    name: player.name,
    score: player.score,
    territoryCount: player.territoryCount,
    points: player.points,
    wins: player.wins
  }));
  archived.seasonEquipmentRewards = buildSeasonEquipmentRewards(archived, ranking);
  archived.archivedAt = Number(now);
  return archived;
}

async function mergeSeasonStats(env, archive, token) {
  const seasonId = archive?.season?.id;
  if (!seasonId) return false;
  const path = rootPath(env, "globalStats");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readDatabase(env, path, token, true);
    const next = current.value || {};
    next.territorySeasonsProcessed ||= {};
    if (next.territorySeasonsProcessed[seasonId]) return false;
    next.playerStats ||= { players: {}, rivalries: {}, recentMatches: [] };
    next.playerStats.players ||= {};
    const ranking = Territory.standings(archive);
    ranking.forEach((result, index) => {
      const key = Territory.playerKey(result.name);
      const record = next.playerStats.players[key] || { name: result.name };
      const totals = record.territory || {};
      record.territory = {
        seasons: (Number(totals.seasons) || 0) + 1,
        championships: (Number(totals.championships) || 0) + Number(index === 0),
        points: (Number(totals.points) || 0) + (Number(result.points) || 0),
        captures: (Number(totals.captures) || 0) + (Number(result.captures) || 0),
        battles: (Number(totals.battles) || 0) + (Number(result.battles) || 0),
        wins: (Number(totals.wins) || 0) + (Number(result.wins) || 0),
        losses: (Number(totals.losses) || 0) + (Number(result.losses) || 0),
        defenses: (Number(totals.defenses) || 0) + (Number(result.defenseWins) || 0),
        skillUses: (Number(totals.skillUses) || 0) + (Number(result.skillUses) || 0),
        bestRank: Math.min(Number(totals.bestRank) || 99, index + 1)
      };
      Equipment.ensureStarterRecord(record);
      const archivedReward = archive.seasonEquipmentRewards?.[result.id];
      const rewards = archivedReward?.items || Equipment.generateRewards(
        `territory-season:${seasonId}:${result.id}:${index + 1}`,
        Equipment.rewardCountForSeason(result, index + 1)
      );
      Equipment.applyRewards(record, rewards);
      next.playerStats.players[key] = record;
    });
    next.territorySeasonsProcessed[seasonId] = Number(archive.archivedAt) || Date.now();
    const written = await writeDatabase(env, path, next, token, current.etag);
    if (written.committed) return true;
  }
  throw new Error("Global territory stats update conflicted repeatedly");
}

async function rolloverIfNeeded(env, current, playerStats, token, now) {
  if (!current?.season?.id || current.season.id === Territory.seasonWindow(now).id) return current;
  const archive = finalizedArchive(current, now);
  await writeDatabase(env, rootPath(env, `frontier/archive/${archive.season.id}`), archive, token);
  await mergeSeasonStats(env, archive, token);
  return Territory.createInitialState(playerStats, now);
}

export async function advanceFrontierWithToken(env, token, now = Date.now()) {
  const statsPath = rootPath(env, "globalStats");
  const currentPath = rootPath(env, "frontier/current");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [statsResult, currentResult] = await Promise.all([
      readDatabase(env, statsPath, token),
      readDatabase(env, currentPath, token, true)
    ]);
    const playerStats = statsResult.value?.playerStats || { players: {} };
    const rolled = await rolloverIfNeeded(env, currentResult.value, playerStats, token, now);
    const advanced = Territory.advanceState(rolled, playerStats, now, { maxTicks: 144 });
    const requiresMigration = Number(currentResult.value?.version) !== Territory.VERSION;
    const requiresWrite = !currentResult.value || rolled !== currentResult.value || requiresMigration || advanced.processed > 0;
    if (!requiresWrite) {
      return {
        ok: true,
        changed: false,
        processed: 0,
        revision: advanced.state.revision,
        seasonId: advanced.state.season.id,
        nextTickAt: advanced.state.season.nextTickAt
      };
    }
    const written = await writeDatabase(env, currentPath, advanced.state, token, currentResult.etag);
    if (written.committed) {
      return {
        ok: true,
        changed: true,
        processed: advanced.processed,
        caughtUp: advanced.caughtUp,
        revision: advanced.state.revision,
        seasonId: advanced.state.season.id,
        nextTickAt: advanced.state.season.nextTickAt
      };
    }
  }
  throw new Error("Frontier state update conflicted repeatedly");
}

export async function advanceFrontier(env, now = Date.now()) {
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return advanceFrontierWithToken(env, await accessToken(env), now);
  }
  const account = await firebaseIdentity(env, "accounts:signUp", { returnSecureToken: true });
  const anonymousEnv = { ...env, FIREBASE_USE_AUTH_QUERY: "true" };
  const sessionPath = rootPath(env, `adminSessions/${account.localId}`);
  try {
    await writeDatabase(anonymousEnv, sessionPath, {
      pinHash: env.TEAM_BINGO_ADMIN_PIN_HASH ||
        "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880",
      expiresAt: Date.now() + 15 * 60 * 1000
    }, account.idToken);
    return await advanceFrontierWithToken(anonymousEnv, account.idToken, now);
  } finally {
    await writeDatabase(anonymousEnv, sessionPath, null, account.idToken).catch(() => {});
    await firebaseIdentity(env, "accounts:delete", { idToken: account.idToken }).catch(() => {});
  }
}

export async function advanceCitiesWithToken(env, token, now = Date.now()) {
  const currentPath = rootPath(env, "cities/current");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readDatabase(env, currentPath, token, true);
    const advanced = City.advanceState(current.value, now, { maxTicks: 144 });
    const requiresWrite = !current.value || Number(current.value?.version) !== City.VERSION || advanced.processed > 0;
    if (!requiresWrite) {
      return {
        ok: true,
        changed: false,
        processed: 0,
        revision: advanced.state.revision,
        nextTickAt: advanced.state.nextTickAt
      };
    }
    const written = await writeDatabase(env, currentPath, advanced.state, token, current.etag);
    if (written.committed) {
      return {
        ok: true,
        changed: true,
        processed: advanced.processed,
        caughtUp: advanced.caughtUp,
        revision: advanced.state.revision,
        nextTickAt: advanced.state.nextTickAt
      };
    }
  }
  throw new Error("City state update conflicted repeatedly");
}

export async function advanceCities(env, now = Date.now()) {
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return advanceCitiesWithToken(env, await accessToken(env), now);
  }
  const account = await firebaseIdentity(env, "accounts:signUp", { returnSecureToken: true });
  const anonymousEnv = { ...env, FIREBASE_USE_AUTH_QUERY: "true" };
  try {
    return await advanceCitiesWithToken(anonymousEnv, account.idToken, now);
  } finally {
    await firebaseIdentity(env, "accounts:delete", { idToken: account.idToken }).catch(() => {});
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async scheduled(_controller, env, context) {
    context.waitUntil(advanceFrontier(env));
    context.waitUntil(advanceCities(env));
    context.waitUntil(createDailyBackup(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        mode: "六王領土戦",
        tickMinutes: Territory.TICK_MINUTES,
        cityMode: "六王都市開発",
        cityTickMinutes: City.TICK_MINUTES,
        now: Date.now()
      });
    }
    if (request.method === "GET" && url.pathname === "/backup-status") {
      return json(await currentBackupStatus(env));
    }
    if (request.method === "POST" && url.pathname === "/tick") {
      const expected = String(env.FRONTIER_ADMIN_TOKEN || "");
      const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      if (!expected || actual !== expected) return json({ ok: false, error: "unauthorized" }, 401);
      try {
        const [frontier, city] = await Promise.all([advanceFrontier(env), advanceCities(env)]);
        return json({ ...frontier, city });
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error) }, 500);
      }
    }
    return json({ ok: false, error: "not_found" }, 404);
  }
};
