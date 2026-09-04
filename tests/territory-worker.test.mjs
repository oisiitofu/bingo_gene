import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";

test("人生すごろく報酬は装備とモンスター熟練度へ一度だけ反映される", async () => {
  const { applyLifeStatsRewards } = await import("../worker/territory-worker.mjs");
  const Equipment = globalThis.TeamBingoTerritoryEquipment;
  const rewards = {
    equip: { id: "equip", playerId: "jan", type: "equipment", count: 3, status: "pending" },
    monster: { id: "monster", playerId: "jan", type: "monsterExp", amount: 75, status: "pending" }
  };
  const stats = {
    playerStats: { players: { "ジャン": { name: "ジャン", monsterDex: { "child-ember": 1 } } } }
  };
  const first = applyLifeStatsRewards(stats, rewards, 1000);
  const record = first.state.playerStats.players["ジャン"];
  const starterCount = Object.values(Equipment.STARTER_ITEMS).reduce((sum, count) => sum + count, 0);

  assert.equal(first.applied, 2);
  assert.equal(Object.values(record.territoryEquipment).reduce((sum, count) => sum + count, 0), starterCount + 3);
  assert.equal(record.monsterMastery["child-ember"], 75);
  assert.equal(record.lifeBoardRewards.equipment, 3);
  assert.equal(record.lifeBoardRewards.monsterExp, 75);

  const duplicate = applyLifeStatsRewards(first.state, rewards, 2000);
  assert.equal(duplicate.applied, 0);
  assert.deepEqual(duplicate.state.playerStats.players["ジャン"], record);
});

test("人生すごろくの都市投資はCITY共有資金へ一度だけ反映される", async () => {
  const { applyLifeCityRewards } = await import("../worker/territory-worker.mjs");
  const City = globalThis.TeamBingoCitySystem;
  const state = City.createInitialState(1000);
  const before = state.players.tofu.resources.money;
  const rewards = {
    city: { id: "city", playerId: "tofu", type: "cityMoney", amount: 24600, status: "pending" }
  };
  const first = applyLifeCityRewards(state, rewards, 2000);

  assert.equal(first.applied, 1);
  assert.equal(first.state.players.tofu.resources.money, before + 24600);
  assert.equal(first.state.players.tofu.history.city.amount, 24600);
  assert.equal(first.state.processedRewards.city, 2000);

  const duplicate = applyLifeCityRewards(first.state, rewards, 3000);
  assert.equal(duplicate.applied, 0);
  assert.equal(duplicate.state.players.tofu.resources.money, before + 24600);
});

test("人生すごろくの領土戦補給は負傷時間と守備隊を回復する", async () => {
  const { applyLifeTerritoryRewards } = await import("../worker/territory-worker.mjs");
  const Territory = globalThis.TeamBingoTerritorySystem;
  const now = Date.UTC(2026, 8, 5, 10, 0);
  const playerStats = { players: {} };
  const state = Territory.createInitialState(playerStats, now);
  state.players.tofu.injuredMonsters["child-ember"] = now + 90 * 60_000;
  const tile = Object.values(state.tiles).find((entry) => entry.ownerId === "tofu" && entry.garrison);
  tile.garrison.hype = 20;
  tile.garrison.fatigue = 5;
  tile.garrison.lineup[0].hp = 15;
  const rewards = { supply: { id: "supply", playerId: "tofu", type: "territoryRecovery", amount: 60, status: "pending" } };
  const first = applyLifeTerritoryRewards(state, playerStats, rewards, now);

  assert.equal(first.applied, 1);
  assert.equal(first.state.players.tofu.injuredMonsters["child-ember"], now + 30 * 60_000);
  const recovered = first.state.tiles[tile.id].garrison;
  assert.ok(recovered.hype > 20);
  assert.ok(recovered.fatigue < 5);
  assert.ok(recovered.lineup[0].hp > 15);
  assert.equal(applyLifeTerritoryRewards(first.state, playerStats, rewards, now + 1000).applied, 0);
});

test("人生すごろくのTOWER加護は休養時間とパーティHPを回復する", async () => {
  const { applyLifeTowerRewards } = await import("../worker/territory-worker.mjs");
  const Tower = globalThis.TeamBingoMonsterTowerSystem;
  const now = Date.UTC(2026, 8, 5, 10, 0);
  const playerStats = { players: {} };
  const state = Tower.createInitialState(playerStats, now);
  const player = state.players.jan;
  player.resting["child-ember"] = now + 90 * 60_000;
  player.waitingUntil = now + 90 * 60_000;
  player.status = "resting";
  player.party[0].hp = 1;
  const rewards = { rest: { id: "rest", playerId: "jan", type: "towerRestMinutes", amount: 60, status: "pending" } };
  const first = applyLifeTowerRewards(state, playerStats, rewards, now);

  assert.equal(first.applied, 1);
  assert.equal(first.state.players.jan.resting["child-ember"], now + 30 * 60_000);
  assert.equal(first.state.players.jan.waitingUntil, now + 30 * 60_000);
  assert.ok(first.state.players.jan.party[0].hp > 1);
  assert.equal(applyLifeTowerRewards(first.state, playerStats, rewards, now + 1000).applied, 0);
});

test("人生すごろくWorkerは共有報酬を確定してキューを完了にする", async () => {
  const originalFetch = globalThis.fetch;
  const Life = globalThis.TeamBingoLifeBoardSystem;
  const City = globalThis.TeamBingoCitySystem;
  const Territory = globalThis.TeamBingoTerritorySystem;
  const Tower = globalThis.TeamBingoMonsterTowerSystem;
  const life = Life.createInitialState(1000);
  life.rewardQueue.rewardA = { id: "rewardA", playerId: "eda", type: "monsterExp", amount: 40, status: "pending", createdAt: 1000 };
  life.rewardQueue.rewardB = { id: "rewardB", playerId: "eda", type: "cityMoney", amount: 18000, status: "pending", createdAt: 1000 };
  life.rewardQueue.rewardC = { id: "rewardC", playerId: "eda", type: "territoryRecovery", amount: 45, status: "pending", createdAt: 1000 };
  life.rewardQueue.rewardD = { id: "rewardD", playerId: "eda", type: "towerRestMinutes", amount: 50, status: "pending", createdAt: 1000 };
  const values = {
    life,
    stats: { playerStats: { players: { "えだ": { name: "えだ", monsterDex: { "child-frost": 1 } } } } },
    city: City.createInitialState(1000),
    frontier: Territory.createInitialState({ players: {} }, 1000),
    tower: Tower.createInitialState({ players: {} }, 1000)
  };
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const key = url.includes("/life/current.json") ? "life"
      : url.includes("/globalStats.json") ? "stats"
      : url.includes("/cities/current.json") ? "city"
      : url.includes("/frontier/current.json") ? "frontier"
      : url.includes("/tower/current.json") ? "tower"
      : "";
    if (!key) throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
    if (init.method === "PUT") {
      values[key] = JSON.parse(init.body);
      writes.push({ key, etag: init.headers["if-match"] });
      return Response.json(values[key]);
    }
    return new Response(JSON.stringify(values[key]), { headers: { "content-type": "application/json", etag: `\"${key}\"` } });
  };

  try {
    const { settleLifeRewardsWithToken } = await import("../worker/territory-worker.mjs");
    const result = await settleLifeRewardsWithToken({
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    }, "worker-token", 5000);

    assert.deepEqual(result, { ok: true, pending: 4, stats: 1, city: 1, territory: 1, tower: 1, settled: 4 });
    assert.equal(values.stats.playerStats.players["えだ"].monsterMastery["child-frost"], 40);
    assert.equal(values.city.players.eda.resources.money, City.AUTO_BUILD_THRESHOLD + 18000);
    assert.equal(values.life.rewardQueue.rewardA.status, "settled");
    assert.equal(values.life.rewardQueue.rewardB.status, "settled");
    assert.equal(values.life.rewardQueue.rewardC.status, "settled");
    assert.equal(values.life.rewardQueue.rewardD.status, "settled");
    assert.equal(values.frontier.lifeRewardsProcessed.rewardC, 5000);
    assert.equal(values.tower.lifeRewardsProcessed.rewardD, 5000);
    assert.deepEqual(writes.map((entry) => entry.key).sort(), ["city", "frontier", "life", "stats", "tower"]);
    assert.ok(writes.every((entry) => entry.etag));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("人生すごろくWorkerはブラウザ不在でも共有経済を進行する", async () => {
  const originalFetch = globalThis.fetch;
  const Life = globalThis.TeamBingoLifeBoardSystem;
  const start = Date.UTC(2026, 8, 5, 0, 0);
  const life = Life.createInitialState(start);
  life.players.lickey.assets.homes.castle = { id: "castle", value: 2_000_000 };
  let saved = structuredClone(life);
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!url.endsWith("/teamBingoV1/life/current.json")) throw new Error(`Unexpected request: ${url}`);
    if (init.method === "PUT") {
      saved = JSON.parse(init.body);
      writes += 1;
      return Response.json(saved);
    }
    return new Response(JSON.stringify(saved), { headers: { "content-type": "application/json", etag: '"life-offline"' } });
  };

  try {
    const { advanceLifeWithToken } = await import("../worker/territory-worker.mjs");
    const result = await advanceLifeWithToken({
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    }, "life-token", life.nextServerTickAt + Life.SERVER_TICK_MS);
    assert.equal(result.changed, true);
    assert.equal(result.processed, 2);
    assert.equal(writes, 1);
    assert.equal(saved.serverCycle, 2);
    assert.ok(saved.players.lickey.cash > Life.STARTING_CASH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("MONSTER TOWER Worker advances shared battles and merges mastery once", async () => {
  const originalFetch = globalThis.fetch;
  const { advanceTowerWithToken } = await import("../worker/territory-worker.mjs");
  const Tower = globalThis.TeamBingoMonsterTowerSystem;
  const Monsters = globalThis.TeamBingoMonsterSystem;
  const now = Date.UTC(2026, 7, 31, 12, 0);
  const dex = Object.fromEntries(Object.keys(Monsters.NODES).filter((id) => id !== "egg").map((id) => [id, 1]));
  const mastery = Object.fromEntries(Object.keys(dex).map((id) => [id, 250000]));
  const playerStats = {
    players: Object.fromEntries(Tower.PLAYERS.map((player) => [Tower.playerKey(player.name), {
      name: player.name,
      monsterDex: dex,
      monsterMastery: { ...mastery }
    }]))
  };
  const tower = Tower.createInitialState({ players: playerStats.players }, now - Tower.PHASE_MS * 5);
  let sharedStats = { playerStats };
  let sharedTower = tower;
  let towerWrites = 0;
  let statsWrites = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/teamBingoV1/tower/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(sharedTower), { headers: { "content-type": "application/json", etag: '"tower-1"' } });
    }
    if (url.endsWith("/teamBingoV1/tower/current.json") && init.method === "PUT") {
      sharedTower = JSON.parse(init.body);
      towerWrites += 1;
      return Response.json(sharedTower);
    }
    if (url.endsWith("/teamBingoV1/globalStats.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(sharedStats), { headers: { "content-type": "application/json", etag: '"stats-1"' } });
    }
    if (url.endsWith("/teamBingoV1/globalStats.json") && init.method === "PUT") {
      sharedStats = JSON.parse(init.body);
      statsWrites += 1;
      return Response.json(sharedStats);
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };

  try {
    const first = await advanceTowerWithToken({
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    }, "tower-token", now);
    const second = await advanceTowerWithToken({
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    }, "tower-token", now);

    assert.equal(first.processed, 5);
    assert.ok(first.rewards > 0);
    assert.equal(second.rewards, 0);
    assert.equal(towerWrites, 1);
    assert.equal(statsWrites, 1);
    assert.ok(Object.keys(sharedStats.towerRewardsProcessed || {}).length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
