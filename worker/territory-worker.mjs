import "../monster-system.js";
import "../territory-equipment.js";
import "../territory-system.js";
import "../city-system.js";
import "../tower-system.js";
import "../life-board-system.js";

const Territory = globalThis.TeamBingoTerritorySystem;
const Equipment = globalThis.TeamBingoTerritoryEquipment;
const City = globalThis.TeamBingoCitySystem;
const Tower = globalThis.TeamBingoMonsterTowerSystem;
const Monster = globalThis.TeamBingoMonsterSystem;
const Life = globalThis.TeamBingoLifeBoardSystem;
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
    const requiresWrite = !current.value || Number(current.value?.version) !== City.VERSION || advanced.migrated || advanced.processed > 0;
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

function trimProcessedRewards(source, limit = 2000) {
  return Object.fromEntries(Object.entries(source || {}).sort(([, a], [, b]) => Number(b) - Number(a)).slice(0, limit));
}

function lifeRewardEntries(rewards = {}) {
  return Object.entries(rewards || {}).filter(([id, reward]) => (
    id && reward?.playerId && Life.PLAYER_BY_ID[reward.playerId] && reward.status !== "settled"
  ));
}

export function applyLifeStatsRewards(value, rewards = {}, now = Date.now()) {
  const next = value && typeof value === "object" ? structuredClone(value) : {};
  next.playerStats ||= { players: {}, rivalries: {}, recentMatches: [] };
  next.playerStats.players ||= {};
  next.lifeRewardsProcessed ||= {};
  let applied = 0;
  lifeRewardEntries(rewards).forEach(([id, reward]) => {
    if (next.lifeRewardsProcessed[id] || !["equipment", "monsterExp"].includes(reward.type)) return;
    const definition = Life.PLAYER_BY_ID[reward.playerId];
    const key = Life.playerKey(definition.name);
    const record = next.playerStats.players[key] || { name: definition.name };
    record.lifeBoardRewards ||= { equipment: 0, monsterExp: 0, cityMoney: 0 };
    if (reward.type === "equipment") {
      const count = Math.max(1, Math.min(40, Math.floor(Number(reward.count) || 1)));
      Equipment.ensureStarterRecord(record);
      Equipment.applyRewards(record, Equipment.generateRewards(`life:${id}`, count));
      record.lifeBoardRewards.equipment = (Number(record.lifeBoardRewards.equipment) || 0) + count;
    } else {
      const amount = Math.max(1, Math.floor(Number(reward.amount) || 1));
      record.monsterMastery ||= {};
      const unlocked = Object.keys(record.monsterDex || {}).filter((nodeId) => (
        nodeId !== "egg" && Number(record.monsterDex[nodeId]) > 0 && Monster.NODES[nodeId]
      ));
      const targetId = unlocked.length
        ? unlocked[Life.seededInt(`life:${id}:monster`, 0, unlocked.length - 1)]
        : "egg";
      record.monsterMastery[targetId] = Math.max(0, Number(record.monsterMastery[targetId]) || 0) + amount;
      record.lifeBoardRewards.monsterExp = (Number(record.lifeBoardRewards.monsterExp) || 0) + amount;
      record.lifeBoardRewards.lastMonsterId = targetId;
    }
    record.lifeBoardRewards.updatedAt = Number(now);
    next.playerStats.players[key] = record;
    next.lifeRewardsProcessed[id] = Number(now);
    applied += 1;
  });
  next.lifeRewardsProcessed = trimProcessedRewards(next.lifeRewardsProcessed);
  return { state: next, applied };
}

export function applyLifeCityRewards(value, rewards = {}, now = Date.now()) {
  const next = City.normalizeState(value, now);
  let applied = 0;
  lifeRewardEntries(rewards).forEach(([id, reward]) => {
    if (reward.type !== "cityMoney" || next.processedRewards[id]) return;
    const city = next.players?.[reward.playerId];
    if (!city) return;
    const amount = Math.max(1, Math.floor(Number(reward.amount) || 1));
    city.resources.money = Math.max(0, Number(city.resources.money) || 0) + amount;
    city.history ||= {};
    city.history[id] = {
      id,
      type: "life-board",
      title: "六王人生すごろく投資",
      detail: `人生コースから都市資金 +¥${amount.toLocaleString("ja-JP")}`,
      amount,
      createdAt: Number(now)
    };
    city.updatedAt = Number(now);
    next.processedRewards[id] = Number(now);
    applied += 1;
  });
  next.processedRewards = trimProcessedRewards(next.processedRewards, 6000);
  if (applied) {
    next.revision = (Number(next.revision) || 0) + 1;
    next.updatedAt = Number(now);
  }
  return { state: next, applied };
}

export function applyLifeTerritoryRewards(value, playerStats = {}, rewards = {}, now = Date.now()) {
  const next = Territory.normalizeState(value, playerStats, now);
  next.lifeRewardsProcessed ||= {};
  let applied = 0;
  lifeRewardEntries(rewards).forEach(([id, reward]) => {
    if (reward.type !== "territoryRecovery" || next.lifeRewardsProcessed[id]) return;
    const player = next.players?.[reward.playerId];
    if (!player) return;
    const minutes = Math.max(1, Math.min(360, Math.floor(Number(reward.amount) || 1)));
    const reduction = minutes * 60_000;
    player.injuredMonsters ||= {};
    Object.entries(player.injuredMonsters).forEach(([nodeId, until]) => {
      const reduced = Number(until) - reduction;
      if (reduced <= Number(now)) delete player.injuredMonsters[nodeId];
      else player.injuredMonsters[nodeId] = reduced;
    });
    Object.values(next.tiles || {}).forEach((tile) => {
      const party = tile?.garrison;
      if (!party || party.ownerId !== reward.playerId) return;
      party.hype = Math.min(100, (Number(party.hype) || 0) + Math.max(5, Math.ceil(minutes / 5)));
      party.fatigue = Math.max(0, (Number(party.fatigue) || 0) - Math.max(1, minutes / 30));
      (party.lineup || []).forEach((member) => {
        member.hp = Math.min(100, (Number(member.hp) || 0) + Math.max(10, Math.ceil(minutes / 3)));
      });
    });
    next.lifeRewardsProcessed[id] = Number(now);
    applied += 1;
  });
  next.lifeRewardsProcessed = trimProcessedRewards(next.lifeRewardsProcessed);
  if (applied) {
    Territory.refreshRecoveredGarrisons(next, playerStats, now);
    next.revision = (Number(next.revision) || 0) + 1;
    next.updatedAt = Number(now);
  }
  return { state: next, applied };
}

export function applyLifeTowerRewards(value, playerStats = {}, rewards = {}, now = Date.now()) {
  let next = Tower.normalizeState(value, playerStats, now);
  next.lifeRewardsProcessed ||= {};
  let applied = 0;
  lifeRewardEntries(rewards).forEach(([id, reward]) => {
    if (reward.type !== "towerRestMinutes" || next.lifeRewardsProcessed[id]) return;
    const player = next.players?.[reward.playerId];
    if (!player) return;
    const minutes = Math.max(1, Math.min(360, Math.floor(Number(reward.amount) || 1)));
    const reduction = minutes * 60_000;
    player.resting = Object.fromEntries(Object.entries(player.resting || {}).flatMap(([nodeId, until]) => {
      const reduced = Number(until) - reduction;
      return reduced > Number(now) ? [[nodeId, reduced]] : [];
    }));
    player.waitingUntil = Math.max(0, (Number(player.waitingUntil) || 0) - reduction);
    if (player.waitingUntil <= Number(now) && player.status === "resting") player.status = "climbing";
    (player.party || []).forEach((member) => {
      const recovery = Math.max(1, Math.round((Number(member.maxHp) || 1) * Math.min(.5, .1 + minutes / 600)));
      member.hp = Math.min(Number(member.maxHp) || 1, (Number(member.hp) || 0) + recovery);
    });
    next.lifeRewardsProcessed[id] = Number(now);
    applied += 1;
  });
  next.lifeRewardsProcessed = trimProcessedRewards(next.lifeRewardsProcessed);
  if (applied) {
    next = Tower.normalizeState(next, playerStats, now);
    next.revision = (Number(next.revision) || 0) + 1;
    next.updatedAt = Number(now);
  }
  return { state: next, applied };
}

async function mergeLifeStatsRewardsWithToken(env, token, rewards, now) {
  if (!lifeRewardEntries(rewards).some(([, reward]) => ["equipment", "monsterExp"].includes(reward.type))) return 0;
  const path = rootPath(env, "globalStats");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readDatabase(env, path, token, true);
    const result = applyLifeStatsRewards(current.value, rewards, now);
    if (!result.applied) return 0;
    const written = await writeDatabase(env, path, result.state, token, current.etag);
    if (written.committed) return result.applied;
  }
  throw new Error("Life stats reward update conflicted repeatedly");
}

async function mergeLifeCityRewardsWithToken(env, token, rewards, now) {
  if (!lifeRewardEntries(rewards).some(([, reward]) => reward.type === "cityMoney")) return 0;
  const path = rootPath(env, "cities/current");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readDatabase(env, path, token, true);
    const result = applyLifeCityRewards(current.value, rewards, now);
    if (!result.applied) return 0;
    const written = await writeDatabase(env, path, result.state, token, current.etag);
    if (written.committed) return result.applied;
  }
  throw new Error("Life city reward update conflicted repeatedly");
}

async function mergeLifeTerritoryRewardsWithToken(env, token, rewards, now) {
  if (!lifeRewardEntries(rewards).some(([, reward]) => reward.type === "territoryRecovery")) return 0;
  const [statsResult, initial] = await Promise.all([
    readDatabase(env, rootPath(env, "globalStats"), token),
    readDatabase(env, rootPath(env, "frontier/current"), token, true)
  ]);
  const playerStats = statsResult.value?.playerStats || { players: {} };
  let current = initial;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = applyLifeTerritoryRewards(current.value, playerStats, rewards, now);
    if (!result.applied) return 0;
    const written = await writeDatabase(env, rootPath(env, "frontier/current"), result.state, token, current.etag);
    if (written.committed) return result.applied;
    current = await readDatabase(env, rootPath(env, "frontier/current"), token, true);
  }
  throw new Error("Life territory reward update conflicted repeatedly");
}

async function mergeLifeTowerRestRewardsWithToken(env, token, rewards, now) {
  if (!lifeRewardEntries(rewards).some(([, reward]) => reward.type === "towerRestMinutes")) return 0;
  const [statsResult, initial] = await Promise.all([
    readDatabase(env, rootPath(env, "globalStats"), token),
    readDatabase(env, rootPath(env, "tower/current"), token, true)
  ]);
  const playerStats = statsResult.value?.playerStats || { players: {} };
  let current = initial;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = applyLifeTowerRewards(current.value, playerStats, rewards, now);
    if (!result.applied) return 0;
    const written = await writeDatabase(env, rootPath(env, "tower/current"), result.state, token, current.etag);
    if (written.committed) return result.applied;
    current = await readDatabase(env, rootPath(env, "tower/current"), token, true);
  }
  throw new Error("Life tower reward update conflicted repeatedly");
}

async function markLifeRewardsSettledWithToken(env, token, rewardIds, now) {
  if (!rewardIds.length) return false;
  const path = rootPath(env, "life/current");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readDatabase(env, path, token, true);
    const next = Life.normalizeState(current.value, now);
    let changed = false;
    rewardIds.forEach((id) => {
      const reward = next.rewardQueue[id];
      if (!reward || reward.status === "settled") return;
      reward.status = "settled";
      reward.settledAt = Number(now);
      const player = next.players[reward.playerId];
      (player?.assets?.equipmentGacha || []).forEach((entry) => {
        if (entry.id === id) entry.status = "awarded";
      });
      changed = true;
    });
    if (!changed) return false;
    next.revision += 1;
    next.updatedAt = Number(now);
    const written = await writeDatabase(env, path, next, token, current.etag);
    if (written.committed) return true;
  }
  throw new Error("Life reward settlement conflicted repeatedly");
}

export async function settleLifeRewardsWithToken(env, token, now = Date.now()) {
  const path = rootPath(env, "life/current");
  const current = await readDatabase(env, path, token);
  const state = Life.normalizeState(current.value, now);
  const entries = lifeRewardEntries(state.rewardQueue);
  if (!entries.length) return { ok: true, pending: 0, stats: 0, city: 0, territory: 0, tower: 0, settled: 0 };
  const rewards = Object.fromEntries(entries);
  const [stats, city, territory, tower] = await Promise.all([
    mergeLifeStatsRewardsWithToken(env, token, rewards, now),
    mergeLifeCityRewardsWithToken(env, token, rewards, now),
    mergeLifeTerritoryRewardsWithToken(env, token, rewards, now),
    mergeLifeTowerRestRewardsWithToken(env, token, rewards, now)
  ]);
  const ids = entries.map(([id]) => id);
  await markLifeRewardsSettledWithToken(env, token, ids, now);
  return { ok: true, pending: entries.length, stats, city, territory, tower, settled: ids.length };
}

export async function settleLifeRewards(env, now = Date.now()) {
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return settleLifeRewardsWithToken(env, await accessToken(env), now);
  }
  const account = await firebaseIdentity(env, "accounts:signUp", { returnSecureToken: true });
  const anonymousEnv = { ...env, FIREBASE_USE_AUTH_QUERY: "true" };
  const sessionPath = rootPath(env, `adminSessions/${account.localId}`);
  try {
    await writeDatabase(anonymousEnv, sessionPath, {
      pinHash: env.TEAM_BINGO_ADMIN_PIN_HASH || "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880",
      expiresAt: Date.now() + 15 * 60 * 1000
    }, account.idToken);
    return await settleLifeRewardsWithToken(anonymousEnv, account.idToken, now);
  } finally {
    await writeDatabase(anonymousEnv, sessionPath, null, account.idToken).catch(() => {});
    await firebaseIdentity(env, "accounts:delete", { idToken: account.idToken }).catch(() => {});
  }
}

export async function advanceLifeWithToken(env, token, now = Date.now()) {
  const path = rootPath(env, "life/current");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readDatabase(env, path, token, true);
    const advanced = Life.advanceServerState(current.value, now, { maxTicks: 120 });
    const requiresWrite = !current.value || advanced.processed > 0 || Number(current.value?.boardRevision) !== 2;
    if (!requiresWrite) return { ok: true, changed: false, processed: 0, caughtUp: advanced.caughtUp, revision: advanced.state.revision, nextTickAt: advanced.state.nextServerTickAt };
    const written = await writeDatabase(env, path, advanced.state, token, current.etag);
    if (written.committed) return { ok: true, changed: true, processed: advanced.processed, caughtUp: advanced.caughtUp, revision: advanced.state.revision, nextTickAt: advanced.state.nextServerTickAt };
  }
  throw new Error("Life server progression conflicted repeatedly");
}

export async function advanceLife(env, now = Date.now()) {
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return advanceLifeWithToken(env, await accessToken(env), now);
  }
  const account = await firebaseIdentity(env, "accounts:signUp", { returnSecureToken: true });
  const anonymousEnv = { ...env, FIREBASE_USE_AUTH_QUERY: "true" };
  const sessionPath = rootPath(env, `adminSessions/${account.localId}`);
  try {
    await writeDatabase(anonymousEnv, sessionPath, {
      pinHash: env.TEAM_BINGO_ADMIN_PIN_HASH || "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880",
      expiresAt: Date.now() + 15 * 60 * 1000
    }, account.idToken);
    return await advanceLifeWithToken(anonymousEnv, account.idToken, now);
  } finally {
    await writeDatabase(anonymousEnv, sessionPath, null, account.idToken).catch(() => {});
    await firebaseIdentity(env, "accounts:delete", { idToken: account.idToken }).catch(() => {});
  }
}

async function maintainLife(env, now = Date.now()) {
  const advance = await advanceLife(env, now);
  const rewards = await settleLifeRewards(env, now);
  return { advance, rewards };
}

export async function mergeTowerRewardsWithToken(env, token, rewards = {}) {
  const entries = Object.entries(rewards || {}).filter(([id, reward]) => id && reward?.playerName && reward?.mastery);
  if (!entries.length) return { merged: 0 };
  const statsPath = rootPath(env, "globalStats");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readDatabase(env, statsPath, token, true);
    const next = current.value || {};
    next.playerStats ||= { players: {}, rivalries: {}, recentMatches: [] };
    next.playerStats.players ||= {};
    next.towerRewardsProcessed ||= {};
    let merged = 0;
    entries.forEach(([id, reward]) => {
      if (next.towerRewardsProcessed[id]) return;
      const key = Tower.playerKey(reward.playerName);
      const record = next.playerStats.players[key] || { name: reward.playerName };
      record.monsterMastery ||= {};
      Object.entries(reward.mastery || {}).forEach(([nodeId, amount]) => {
        record.monsterMastery[nodeId] = Math.max(0, Number(record.monsterMastery[nodeId]) || 0) + Math.max(0, Number(amount) || 0);
      });
      next.playerStats.players[key] = record;
      next.towerRewardsProcessed[id] = Number(reward.createdAt) || Date.now();
      merged += 1;
    });
    if (!merged) return { merged: 0 };
    next.towerRewardsProcessed = trimProcessedRewards(next.towerRewardsProcessed);
    const written = await writeDatabase(env, statsPath, next, token, current.etag);
    if (written.committed) return { merged };
  }
  throw new Error("Tower mastery update conflicted repeatedly");
}

export async function advanceTowerWithToken(env, token, now = Date.now()) {
  const statsPath = rootPath(env, "globalStats");
  const currentPath = rootPath(env, "tower/current");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [statsResult, currentResult] = await Promise.all([
      readDatabase(env, statsPath, token),
      readDatabase(env, currentPath, token, true)
    ]);
    const playerStats = statsResult.value?.playerStats || { players: {} };
    const advanced = Tower.advanceState(currentResult.value, playerStats, now, { maxTicks: 1440 });
    const requiresWrite = !currentResult.value || Number(currentResult.value?.version) !== Tower.VERSION || advanced.processed > 0;
    let towerState = advanced.state;
    if (requiresWrite) {
      const written = await writeDatabase(env, currentPath, towerState, token, currentResult.etag);
      if (!written.committed) continue;
      towerState = written.value || towerState;
    }
    const rewardResult = await mergeTowerRewardsWithToken(env, token, towerState.rewardQueue || {});
    return {
      ok: true,
      changed: requiresWrite,
      processed: advanced.processed,
      rewards: rewardResult.merged,
      revision: towerState.revision,
      nextTickAt: towerState.nextTickAt
    };
  }
  throw new Error("Tower state update conflicted repeatedly");
}

export async function advanceTower(env, now = Date.now()) {
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return advanceTowerWithToken(env, await accessToken(env), now);
  }
  const account = await firebaseIdentity(env, "accounts:signUp", { returnSecureToken: true });
  const anonymousEnv = { ...env, FIREBASE_USE_AUTH_QUERY: "true" };
  const sessionPath = rootPath(env, `adminSessions/${account.localId}`);
  try {
    await writeDatabase(anonymousEnv, sessionPath, {
      pinHash: env.TEAM_BINGO_ADMIN_PIN_HASH || "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880",
      expiresAt: Date.now() + 15 * 60 * 1000
    }, account.idToken);
    return await advanceTowerWithToken(anonymousEnv, account.idToken, now);
  } finally {
    await writeDatabase(anonymousEnv, sessionPath, null, account.idToken).catch(() => {});
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
    context.waitUntil(advanceTower(env));
    context.waitUntil(maintainLife(env));
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
        towerMode: "MONSTER TOWER",
        towerFloors: Tower.MAX_FLOOR,
        lifeMode: "六王人生すごろく",
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
        const [frontier, city, tower, life] = await Promise.all([advanceFrontier(env), advanceCities(env), advanceTower(env), maintainLife(env)]);
        return json({ ...frontier, city, tower, life });
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error) }, 500);
      }
    }
    return json({ ok: false, error: "not_found" }, 404);
  }
};
