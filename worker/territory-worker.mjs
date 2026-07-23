import "../monster-system.js";
import "../territory-system.js";

const Territory = globalThis.TeamBingoTerritorySystem;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_SCOPES = [
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");

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
    const requiresWrite = !currentResult.value || rolled !== currentResult.value || advanced.processed > 0;
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
  return advanceFrontierWithToken(env, await accessToken(env), now);
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
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        mode: "六王領土戦",
        tickMinutes: Territory.TICK_MINUTES,
        now: Date.now()
      });
    }
    if (request.method === "POST" && url.pathname === "/tick") {
      const expected = String(env.FRONTIER_ADMIN_TOKEN || "");
      const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      if (!expected || actual !== expected) return json({ ok: false, error: "unauthorized" }, 401);
      try {
        return json(await advanceFrontier(env));
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error) }, 500);
      }
    }
    return json({ ok: false, error: "not_found" }, 404);
  }
};
