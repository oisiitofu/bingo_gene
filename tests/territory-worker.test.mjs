import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

test("六王領土戦WorkerはOAuth認証後にETag付きで初期状態を保存する", async () => {
  const originalFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  if (!globalThis.crypto) globalThis.crypto = (await import("node:crypto")).webcrypto;
  const requests = [];
  let savedState = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.endsWith("/teamBingoV1/globalStats.json")) {
      return new Response(JSON.stringify({ playerStats: { players: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.endsWith("/teamBingoV1/frontier/current.json") && (!init.method || init.method === "GET")) {
      return new Response("null", {
        status: 200,
        headers: { "content-type": "application/json", etag: "\"empty\"" }
      });
    }
    if (url.endsWith("/teamBingoV1/frontier/current.json") && init.method === "PUT") {
      savedState = JSON.parse(init.body);
      return new Response(init.body, {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };

  try {
    const { advanceFrontier } = await import("../worker/territory-worker.mjs");
    const result = await advanceFrontier({
      FIREBASE_CLIENT_EMAIL: "worker@example.test",
      FIREBASE_PRIVATE_KEY: privateKey,
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    }, Date.UTC(2026, 6, 23, 0, 0));

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(savedState.version, 5);
    assert.equal(Object.keys(savedState.players).length, 6);
    assert.ok(Object.values(savedState.tiles).filter((tile) => tile.ownerId).every((tile) => (
      tile.garrison?.lineup?.length === 3 && tile.garrison?.hype === 20
    )));
    const write = requests.find((request) => request.init.method === "PUT");
    assert.equal(write.init.headers["if-match"], "\"empty\"");
    assert.equal(write.init.headers.authorization, "Bearer test-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (!originalCrypto) delete globalThis.crypto;
  }
});

test("秘密鍵がないWorkerはFirebase匿名管理セッションで定期処理できる", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("identitytoolkit.googleapis.com/v1/accounts:signUp")) {
      return Response.json({ localId: "worker-anon", idToken: "anonymous-token" });
    }
    if (url.includes("identitytoolkit.googleapis.com/v1/accounts:delete")) {
      return Response.json({});
    }
    if (url.includes("/teamBingoV1/adminSessions/worker-anon.json")) {
      return Response.json(init.body ? JSON.parse(init.body) : null);
    }
    if (url.includes("/teamBingoV1/globalStats.json")) {
      return Response.json({ playerStats: { players: {} } });
    }
    if (url.includes("/teamBingoV1/frontier/current.json") && (!init.method || init.method === "GET")) {
      return new Response("null", {
        headers: { "content-type": "application/json", etag: "\"empty\"" }
      });
    }
    if (url.includes("/teamBingoV1/frontier/current.json") && init.method === "PUT") {
      return new Response(init.body, { headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };

  try {
    const { advanceFrontier } = await import("../worker/territory-worker.mjs");
    const result = await advanceFrontier({
      FIREBASE_API_KEY: "public-test-key",
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1",
      TEAM_BINGO_ADMIN_PIN_HASH: "test-pin-hash"
    }, Date.UTC(2026, 6, 23, 0, 0));

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    const sessionWrite = requests.find((request) => (
      request.url.includes("/adminSessions/worker-anon.json") && request.init.method === "PUT"
    ));
    assert.ok(sessionWrite);
    assert.equal(JSON.parse(sessionWrite.init.body).pinHash, "test-pin-hash");
    assert.match(sessionWrite.url, /auth=anonymous-token/);
    assert.ok(requests.some((request) => request.url.includes("accounts:delete")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("定刻前でもバージョン2の領土状態をバージョン4へ保存移行する", async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.UTC(2026, 6, 23, 0, 1);
  const Territory = globalThis.TeamBingoTerritorySystem;
  const legacy = Territory.createInitialState({ players: {} }, now);
  legacy.version = 2;
  legacy.season.nextTickAt = now + Territory.TICK_MS;
  Object.values(legacy.tiles).forEach((tile) => {
    delete tile.garrison;
    delete tile.eventId;
    delete tile.eventCycle;
  });
  let savedState = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("identitytoolkit.googleapis.com/v1/accounts:signUp")) {
      return Response.json({ localId: "migration-worker", idToken: "migration-token" });
    }
    if (url.includes("identitytoolkit.googleapis.com/v1/accounts:delete")) return Response.json({});
    if (url.includes("/teamBingoV1/adminSessions/migration-worker.json")) {
      return Response.json(init.body ? JSON.parse(init.body) : null);
    }
    if (url.includes("/teamBingoV1/globalStats.json")) {
      return Response.json({ playerStats: { players: {} } });
    }
    if (url.includes("/teamBingoV1/frontier/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(legacy), {
        headers: { "content-type": "application/json", etag: "\"legacy\"" }
      });
    }
    if (url.includes("/teamBingoV1/frontier/current.json") && init.method === "PUT") {
      savedState = JSON.parse(init.body);
      return new Response(init.body, { headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };

  try {
    const { advanceFrontier } = await import("../worker/territory-worker.mjs");
    const result = await advanceFrontier({
      FIREBASE_API_KEY: "public-test-key",
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1",
      TEAM_BINGO_ADMIN_PIN_HASH: "test-pin-hash"
    }, now);

    assert.equal(result.changed, true);
    assert.equal(result.processed, 0);
    assert.equal(savedState.version, 5);
    assert.ok(Object.values(savedState.tiles).filter((tile) => tile.ownerId).every((tile) => (
      tile.garrison?.lineup?.length === 3 && tile.garrison?.hype === 20
    )));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("シーズン装備報酬はアーカイブ表示と戦績付与で再現できる", async () => {
  const Territory = globalThis.TeamBingoTerritorySystem;
  const Equipment = globalThis.TeamBingoTerritoryEquipment;
  const state = Territory.createInitialState({ players: {} }, Date.UTC(2026, 6, 27, 0, 0));
  const ranking = Territory.standings(state);
  const { buildSeasonEquipmentRewards } = await import("../worker/territory-worker.mjs");
  const first = buildSeasonEquipmentRewards(state, ranking);
  const second = buildSeasonEquipmentRewards(state, ranking);

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ranking.map((player) => player.id).sort());
  ranking.forEach((player, index) => {
    const reward = first[player.id];
    assert.equal(reward.rank, index + 1);
    assert.equal(
      Object.values(reward.items).reduce((sum, count) => sum + count, 0),
      Equipment.rewardCountForSeason(player, index + 1)
    );
    Object.keys(reward.items).forEach((itemId) => assert.ok(Equipment.ITEM_BY_ID[itemId]));
  });
});

test("日次バックアップはFirebase共有ルート全体を圧縮し同日に重複作成しない", async () => {
  const originalFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  if (!globalThis.crypto) globalThis.crypto = (await import("node:crypto")).webcrypto;
  const values = new Map();
  const writes = [];
  const backupStore = {
    async get(key) {
      return values.get(key)?.value || null;
    },
    async put(key, value, options = {}) {
      const stored = typeof value === "string" ? value : Buffer.from(value);
      values.set(key, { value: stored, options });
      writes.push({ key, value: stored, options });
    }
  };
  let rootReads = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/teamBingoV1.json")) {
      rootReads += 1;
      return Response.json({
        globalStats: { ranking: { 53: 12 }, playerStats: { players: { jan: { opens: 4 } } } },
        frontier: { current: { revision: 7 } },
        worldTournaments: { rooms: { cup: { id: "cup" } } }
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const { createDailyBackupWithToken, dailyBackupKeys } = await import("../worker/territory-worker.mjs");
    const now = Date.UTC(2026, 7, 17, 15, 5);
    const env = {
      BACKUP_STORE: backupStore,
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    };
    const first = await createDailyBackupWithToken(env, "backup-token", now);
    const second = await createDailyBackupWithToken(env, "backup-token", now + 60_000);
    const keys = dailyBackupKeys(now);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.reason, "already-created");
    assert.equal(rootReads, 1);
    assert.deepEqual(writes.map((write) => write.key), [keys.data, keys.marker]);
    assert.equal(writes[0].options.expirationTtl, 90 * 24 * 60 * 60);
    assert.match(writes[0].options.metadata.sha256, /^[a-f0-9]{64}$/);
    const envelope = JSON.parse(gunzipSync(writes[0].value).toString("utf8"));
    assert.equal(envelope.format, "team-bingo-rtdb-full-backup");
    assert.equal(envelope.firebaseRoot, "teamBingoV1");
    assert.equal(envelope.data.globalStats.ranking[53], 12);
    assert.equal(envelope.data.frontier.current.revision, 7);
    assert.equal(envelope.data.worldTournaments.rooms.cup.id, "cup");
  } finally {
    globalThis.fetch = originalFetch;
    if (!originalCrypto) delete globalThis.crypto;
  }
});
