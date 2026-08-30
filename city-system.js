(function bootstrapBingoCitySystem(global) {
  "use strict";

  const VERSION = 1;
  const GRID_SIZE = 16;
  const TICK_MINUTES = 10;
  const TICK_MS = TICK_MINUTES * 60 * 1000;
  const MAX_HISTORY = 160;
  const MAX_PROCESSED = 1000;

  const PLAYERS = Object.freeze([
    { id: "tofu", name: "おいしいとうふ", color: "#e8e5dc", accent: "#90c36a", cityName: "とうふ未来市" },
    { id: "eda", name: "えだ", color: "#e54152", accent: "#3e8eff", cityName: "三刃中央市" },
    { id: "jan", name: "ジャン", color: "#ffd32a", accent: "#fff19a", cityName: "運命改都" },
    { id: "rima", name: "リーマ", color: "#ff7139", accent: "#b3ef52", cityName: "深夜補給市" },
    { id: "kento", name: "Kento", color: "#9f61ff", accent: "#e3c9ff", cityName: "紫電配信都市" },
    { id: "lickey", name: "Lickey", color: "#35baff", accent: "#f5c84c", cityName: "Lickey王都" }
  ]);
  const PLAYER_BY_ID = Object.freeze(Object.fromEntries(PLAYERS.map((player) => [player.id, player])));

  const BUILDINGS = Object.freeze({
    road: {
      id: "road", name: "都市道路", category: "transport", cost: 120, materials: 2, upkeep: 1,
      description: "街を接続する道路。建物は道路に接している必要があります。"
    },
    residential: {
      id: "residential", name: "集合住宅", category: "zone", cost: 560, materials: 10, upkeep: 3,
      populationCapacity: 180, powerDemand: 4, waterDemand: 4, happiness: 1, tax: 34,
      description: "人口を増やす現代的な住宅区画。"
    },
    commercial: {
      id: "commercial", name: "商業タワー", category: "zone", cost: 820, materials: 14, upkeep: 5,
      jobs: 95, powerDemand: 7, waterDemand: 3, happiness: 1, tourism: 4, tax: 74,
      description: "雇用と税収を生む商業・オフィス複合施設。"
    },
    industrial: {
      id: "industrial", name: "先端工業区", category: "zone", cost: 980, materials: 18, upkeep: 6,
      jobs: 130, powerDemand: 10, waterDemand: 6, materialsOutput: 3, pollution: 7, tax: 86,
      description: "資材と雇用を生みますが、環境へ負荷を与えます。"
    },
    park: {
      id: "park", name: "中央公園", category: "public", cost: 480, materials: 8, upkeep: 4,
      happiness: 8, environment: 12, tourism: 3,
      description: "幸福度と環境を改善する緑地。"
    },
    power: {
      id: "power", name: "都市発電所", category: "infrastructure", cost: 1750, materials: 34, upkeep: 12,
      powerSupply: 120, pollution: 5, jobs: 18,
      description: "街全体へ電力を供給する複合エネルギー施設。"
    },
    water: {
      id: "water", name: "浄水センター", category: "infrastructure", cost: 1450, materials: 28, upkeep: 10,
      waterSupply: 120, environment: 2, jobs: 14,
      description: "生活と産業に必要な水を供給します。"
    },
    civic: {
      id: "civic", name: "市庁舎", category: "landmark", cost: 0, materials: 0, upkeep: 8,
      jobs: 40, happiness: 5, safety: 8, tourism: 8,
      unique: true, description: "都市運営の中心。街の発展段階に応じて成長します。"
    },
    arena: {
      id: "arena", name: "ビンゴアリーナ", category: "landmark", cost: 2600, materials: 42, upkeep: 16,
      jobs: 65, happiness: 7, tourism: 18, tax: 35,
      unique: true, description: "ビンゴの戦績を街の熱狂と観光へ変える特別施設。"
    }
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function playerKey(name) {
    return String(name || "").trim().toLocaleLowerCase("ja-JP").replace(/\s+/g, "");
  }

  function playerForName(name) {
    const key = playerKey(name);
    return PLAYERS.find((player) => playerKey(player.name) === key) || null;
  }

  function tileId(x, z) {
    return `${Math.trunc(Number(x) || 0)},${Math.trunc(Number(z) || 0)}`;
  }

  function parseTileId(id) {
    const [x, z] = String(id || "").split(",").map(Number);
    return { x: Number.isFinite(x) ? x : -1, z: Number.isFinite(z) ? z : -1 };
  }

  function insideGrid(x, z) {
    return x >= 0 && z >= 0 && x < GRID_SIZE && z < GRID_SIZE;
  }

  function neighbors(id) {
    const { x, z } = parseTileId(id);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dz]) => tileId(x + dx, z + dz))
      .filter((next) => {
        const point = parseTileId(next);
        return insideGrid(point.x, point.z);
      });
  }

  function initialTiles() {
    const tiles = {};
    for (let n = 3; n <= 12; n += 1) {
      tiles[tileId(7, n)] = { id: tileId(7, n), kind: "road", buildingId: "road", level: 1 };
      tiles[tileId(n, 7)] = { id: tileId(n, 7), kind: "road", buildingId: "road", level: 1 };
    }
    [
      [6, 6, "civic"], [6, 8, "residential"], [8, 6, "commercial"], [8, 8, "park"],
      [5, 6, "residential"], [9, 8, "industrial"], [5, 8, "power"], [9, 6, "water"]
    ].forEach(([x, z, buildingId]) => {
      const id = tileId(x, z);
      tiles[id] = { id, kind: "building", buildingId, level: 1 };
    });
    return tiles;
  }

  function emptyMetrics() {
    return {
      population: 180, capacity: 0, happiness: 70, jobs: 0, safety: 55, education: 45,
      health: 55, tourism: 0, environment: 70, pollution: 0,
      powerDemand: 0, powerSupply: 0, waterDemand: 0, waterSupply: 0,
      employmentRate: 100, powerCoverage: 100, waterCoverage: 100, cityScore: 0
    };
  }

  function createPlayerCity(player, now) {
    const city = {
      id: player.id,
      name: player.cityName,
      ownerName: player.name,
      color: player.color,
      accent: player.accent,
      level: 1,
      resources: { money: 12000, materials: 160, research: 0, hype: 20, blueprints: 0 },
      metrics: emptyMetrics(),
      economy: { taxRate: 10, lastIncome: 0, lastExpense: 0, balance: 0 },
      tiles: initialTiles(),
      unlocks: { road: true, residential: true, commercial: true, industrial: true, park: true, power: true, water: true, civic: true },
      inbox: {},
      history: {},
      createdAt: now,
      updatedAt: now
    };
    city.metrics = calculateMetrics(city);
    return city;
  }

  function createInitialState(now = Date.now()) {
    const timestamp = Number(now) || Date.now();
    return {
      version: VERSION,
      revision: 0,
      players: Object.fromEntries(PLAYERS.map((player) => [player.id, createPlayerCity(player, timestamp)])),
      processedRewards: {},
      processedCommands: {},
      lastTickAt: timestamp,
      nextTickAt: timestamp + TICK_MS,
      updatedAt: timestamp
    };
  }

  function buildingScale(tile) {
    return Math.max(1, Math.min(3, Number(tile?.level) || 1));
  }

  function calculateMetrics(city) {
    const previous = city?.metrics || emptyMetrics();
    const totals = {
      populationCapacity: 0, jobs: 0, happiness: 0, safety: 0, education: 0, health: 0,
      tourism: 0, environment: 0, pollution: 0, powerDemand: 0, powerSupply: 0,
      waterDemand: 0, waterSupply: 0, tax: 0, materialsOutput: 0, upkeep: 0
    };
    Object.values(city?.tiles || {}).forEach((tile) => {
      const definition = BUILDINGS[tile?.buildingId];
      if (!definition) return;
      const scale = buildingScale(tile);
      Object.keys(totals).forEach((field) => {
        if (definition[field]) totals[field] += Number(definition[field]) * scale;
      });
    });
    const population = Math.max(0, Math.min(Number(previous.population) || 0, Math.max(180, totals.populationCapacity)));
    const powerCoverage = totals.powerDemand ? Math.min(100, Math.round(totals.powerSupply / totals.powerDemand * 100)) : 100;
    const waterCoverage = totals.waterDemand ? Math.min(100, Math.round(totals.waterSupply / totals.waterDemand * 100)) : 100;
    const employmentRate = population ? Math.min(100, Math.round(totals.jobs / Math.max(1, population * .48) * 100)) : 100;
    const infrastructurePenalty = Math.round((100 - Math.min(powerCoverage, waterCoverage)) * .38);
    const happiness = Math.max(0, Math.min(100,
      62 + totals.happiness + Math.round(totals.environment * .35) - Math.round(totals.pollution * .75) - infrastructurePenalty
    ));
    const environment = Math.max(0, Math.min(100, 68 + totals.environment - totals.pollution));
    const cityScore = Math.round(
      population * .55 + happiness * 14 + totals.jobs * 1.8 + totals.tourism * 20 +
      environment * 8 + Math.min(powerCoverage, waterCoverage) * 6
    );
    return {
      ...previous,
      population,
      capacity: totals.populationCapacity,
      happiness,
      jobs: totals.jobs,
      safety: Math.min(100, 52 + totals.safety),
      education: Math.min(100, 45 + totals.education),
      health: Math.min(100, 52 + totals.health),
      tourism: totals.tourism,
      environment,
      pollution: totals.pollution,
      powerDemand: totals.powerDemand,
      powerSupply: totals.powerSupply,
      waterDemand: totals.waterDemand,
      waterSupply: totals.waterSupply,
      employmentRate,
      powerCoverage,
      waterCoverage,
      cityScore,
      taxPotential: totals.tax,
      materialsOutput: totals.materialsOutput,
      upkeep: totals.upkeep
    };
  }

  function adjacentToRoad(city, id) {
    return neighbors(id).some((nextId) => city.tiles?.[nextId]?.buildingId === "road");
  }

  function connectedRoad(city, id) {
    const roadTiles = Object.values(city.tiles || {}).filter((tile) => tile.buildingId === "road");
    return !roadTiles.length || neighbors(id).some((nextId) => city.tiles?.[nextId]?.buildingId === "road");
  }

  function canBuild(city, id, buildingId) {
    const definition = BUILDINGS[buildingId];
    const point = parseTileId(id);
    if (!definition || !insideGrid(point.x, point.z)) return { ok: false, reason: "建設できない場所です。" };
    if (city.tiles?.[id]) return { ok: false, reason: "すでに道路か建物があります。" };
    if (!city.unlocks?.[buildingId]) return { ok: false, reason: "まだ解放されていない施設です。" };
    if (definition.unique && Object.values(city.tiles || {}).some((tile) => tile.buildingId === buildingId)) {
      return { ok: false, reason: "この施設は都市に一つだけ建設できます。" };
    }
    if (buildingId === "road" ? !connectedRoad(city, id) : !adjacentToRoad(city, id)) {
      return { ok: false, reason: buildingId === "road" ? "既存の道路へ接続してください。" : "道路に接する場所を選んでください。" };
    }
    if ((Number(city.resources?.money) || 0) < definition.cost) return { ok: false, reason: "資金が足りません。" };
    if ((Number(city.resources?.materials) || 0) < definition.materials) return { ok: false, reason: "資材が足りません。" };
    return { ok: true, definition };
  }

  function trimMap(source, keep) {
    return Object.fromEntries(Object.entries(source || {})
      .sort(([, a], [, b]) => (Number(b?.createdAt || b) || 0) - (Number(a?.createdAt || a) || 0))
      .slice(0, keep));
  }

  function addHistory(city, type, title, detail, now, extra = {}) {
    const id = `${Number(now)}-${type}-${Object.keys(city.history || {}).length}`;
    city.history ||= {};
    city.history[id] = { id, type, title, detail, createdAt: Number(now), ...extra };
    city.history = trimMap(city.history, MAX_HISTORY);
  }

  function applyCommand(value, command = {}, now = Date.now()) {
    const state = value?.version === VERSION ? clone(value) : createInitialState(now);
    const commandId = String(command.id || "");
    if (!commandId) return { state, applied: false, error: "操作IDがありません。" };
    state.processedCommands ||= {};
    if (state.processedCommands[commandId]) return { state, applied: false, duplicate: true };
    const city = state.players?.[command.playerId];
    if (!city) return { state, applied: false, error: "都市が見つかりません。" };
    const id = String(command.tileId || "");
    if (command.type === "build") {
      const result = canBuild(city, id, String(command.buildingId || ""));
      if (!result.ok) return { state, applied: false, error: result.reason };
      city.resources.money -= result.definition.cost;
      city.resources.materials -= result.definition.materials;
      city.tiles[id] = { id, kind: result.definition.id === "road" ? "road" : "building", buildingId: result.definition.id, level: 1 };
      addHistory(city, "build", `${result.definition.name} 建設`, `${id} に新しい施設が完成しました。`, now, { tileId: id, buildingId: result.definition.id });
    } else if (command.type === "upgrade") {
      const tile = city.tiles?.[id];
      const definition = BUILDINGS[tile?.buildingId];
      if (!tile || !definition || definition.id === "road") return { state, applied: false, error: "強化できる建物を選んでください。" };
      if ((Number(tile.level) || 1) >= 3) return { state, applied: false, error: "この建物は最大レベルです。" };
      const nextLevel = (Number(tile.level) || 1) + 1;
      const money = Math.round(definition.cost * (.75 + nextLevel * .25));
      const materials = Math.round(definition.materials * (.75 + nextLevel * .2));
      if (city.resources.money < money || city.resources.materials < materials) return { state, applied: false, error: "強化に必要な資源が足りません。" };
      city.resources.money -= money;
      city.resources.materials -= materials;
      tile.level = nextLevel;
      addHistory(city, "upgrade", `${definition.name} LEVEL ${nextLevel}`, "建物の性能と外観が向上しました。", now, { tileId: id, buildingId: definition.id });
    } else if (command.type === "demolish") {
      const tile = city.tiles?.[id];
      const definition = BUILDINGS[tile?.buildingId];
      if (!tile || !definition || definition.id === "civic") return { state, applied: false, error: "撤去できない場所です。" };
      city.resources.money += Math.round(definition.cost * .2);
      city.resources.materials += Math.round(definition.materials * .25);
      delete city.tiles[id];
      addHistory(city, "demolish", `${definition.name} 撤去`, "跡地を更地へ戻しました。", now, { tileId: id });
    } else {
      return { state, applied: false, error: "未対応の都市操作です。" };
    }
    city.metrics = calculateMetrics(city);
    city.updatedAt = Number(now);
    state.processedCommands[commandId] = Number(now);
    state.processedCommands = trimMap(state.processedCommands, MAX_PROCESSED);
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Number(now);
    return { state, applied: true };
  }

  function cityLevel(population) {
    if (population >= 100000) return 6;
    if (population >= 30000) return 5;
    if (population >= 10000) return 4;
    if (population >= 2500) return 3;
    if (population >= 500) return 2;
    return 1;
  }

  function advanceCity(city, now) {
    const metrics = calculateMetrics(city);
    const infrastructure = Math.min(metrics.powerCoverage, metrics.waterCoverage) / 100;
    const jobsLimit = Math.max(180, Math.round(metrics.jobs / .44));
    const target = Math.min(metrics.capacity || 180, jobsLimit);
    const growthFactor = Math.max(0, (metrics.happiness - 42) / 58) * infrastructure;
    const gap = target - metrics.population;
    const growth = gap > 0 ? Math.max(0, Math.min(Math.ceil(gap * .035 * growthFactor), 24)) : Math.max(-12, Math.ceil(gap * .02));
    metrics.population = Math.max(0, metrics.population + growth);
    const income = Math.max(0, Math.round(metrics.population * .018 * (city.economy.taxRate / 10) + metrics.taxPotential));
    const expense = Math.max(0, Math.round(metrics.upkeep));
    city.resources.money = Math.max(0, Math.round((Number(city.resources.money) || 0) + income - expense));
    city.resources.materials = Math.max(0, Math.round((Number(city.resources.materials) || 0) + metrics.materialsOutput));
    city.resources.hype = Math.max(0, Math.min(100, (Number(city.resources.hype) || 0) - .2));
    city.economy = { ...city.economy, lastIncome: income, lastExpense: expense, balance: income - expense };
    city.metrics = calculateMetrics({ ...city, metrics });
    city.level = cityLevel(city.metrics.population);
    if (city.level >= 2) city.unlocks.arena = true;
    city.updatedAt = Number(now);
  }

  function advanceState(value, now = Date.now(), options = {}) {
    const state = value?.version === VERSION ? clone(value) : createInitialState(now);
    const maximum = Math.max(1, Number(options.maxTicks) || 144);
    let processed = 0;
    let cursor = Number(state.nextTickAt) || (Number(state.lastTickAt) || Number(now)) + TICK_MS;
    while (cursor <= Number(now) && processed < maximum) {
      Object.values(state.players || {}).forEach((city) => advanceCity(city, cursor));
      state.lastTickAt = cursor;
      cursor += TICK_MS;
      processed += 1;
    }
    state.nextTickAt = cursor;
    if (processed) {
      state.revision = (Number(state.revision) || 0) + processed;
      state.updatedAt = Number(now);
    }
    return { state, processed, caughtUp: cursor > Number(now) };
  }

  function rewardForPlayer(entry = {}) {
    const opens = Math.max(0, Number(entry.opens) || 0);
    const bingoLines = Math.max(0, Number(entry.bingoLines) || 0);
    const won = Boolean(entry.won);
    const mvp = Boolean(entry.mvp);
    const victoryKind = String(entry.victoryKind || "normal");
    return {
      money: opens * 100 + bingoLines * 500 + (won ? 1500 : 300),
      materials: opens * 4 + bingoLines * 15 + (won ? 30 : 8),
      research: bingoLines * 2 + (mvp ? 3 : 0),
      hype: bingoLines * 3 + (won ? 10 : 0) + (victoryKind === "comeback" ? 20 : 0),
      blueprints: mvp ? 1 : 0
    };
  }

  function applyMatchReward(value, payload = {}, now = Date.now()) {
    const state = value?.version === VERSION ? clone(value) : createInitialState(now);
    const rewardId = String(payload.id || "");
    if (!rewardId) return { state, applied: false, error: "報酬IDがありません。" };
    state.processedRewards ||= {};
    if (state.processedRewards[rewardId]) return { state, applied: false, duplicate: true };
    const rewards = {};
    (Array.isArray(payload.players) ? payload.players : []).forEach((entry) => {
      const player = playerForName(entry?.name);
      const city = player ? state.players?.[player.id] : null;
      if (!city) return;
      const reward = rewardForPlayer(entry);
      Object.entries(reward).forEach(([field, amount]) => {
        city.resources[field] = Math.max(0, (Number(city.resources[field]) || 0) + Number(amount || 0));
      });
      city.resources.hype = Math.min(100, city.resources.hype);
      city.inbox ||= {};
      city.inbox[rewardId] = {
        id: rewardId, matchId: payload.matchId || rewardId, reward, createdAt: Number(now),
        title: entry.won ? "BINGO VICTORY REWARD" : "BINGO MATCH REWARD"
      };
      city.inbox = trimMap(city.inbox, 30);
      addHistory(city, "bingo", entry.won ? "ビンゴ勝利報酬" : "ビンゴ参加報酬", `資金 +${reward.money} / 資材 +${reward.materials}`, now, { rewardId });
      city.updatedAt = Number(now);
      rewards[player.id] = reward;
    });
    state.processedRewards[rewardId] = Number(now);
    state.processedRewards = trimMap(state.processedRewards, MAX_PROCESSED);
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Number(now);
    return { state, applied: true, rewards };
  }

  function standings(state) {
    return PLAYERS.map((player) => {
      const city = state?.players?.[player.id] || createPlayerCity(player, Date.now());
      const metrics = calculateMetrics(city);
      return { id: player.id, name: player.name, cityName: city.name, color: player.color, level: city.level, ...metrics };
    }).sort((a, b) => b.cityScore - a.cityScore || b.population - a.population || a.name.localeCompare(b.name, "ja-JP"));
  }

  const api = {
    VERSION, GRID_SIZE, TICK_MINUTES, TICK_MS, PLAYERS, PLAYER_BY_ID, BUILDINGS,
    clone, playerKey, playerForName, tileId, parseTileId, neighbors,
    createInitialState, calculateMetrics, canBuild, applyCommand, advanceState,
    rewardForPlayer, applyMatchReward, standings
  };

  global.TeamBingoCitySystem = api;
})(typeof window !== "undefined" ? window : globalThis);
