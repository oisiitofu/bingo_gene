(function bootstrapLifeBoardSystem(global) {
  "use strict";

  const VERSION = 1;
  const BOARD_SIZE = 1000;
  const REGION_SIZE = 100;
  const MAX_HISTORY = 600;
  const MAX_PROCESSED_OPENS = 6000;
  const STARTING_CASH = 300000;

  const PLAYERS = Object.freeze([
    { id: "tofu", name: "おいしいとうふ", color: "#e8e5dc", accent: "#8fc66c", strategy: "steady", specialty: "housing" },
    { id: "eda", name: "えだ", color: "#e74352", accent: "#4aa3ff", strategy: "aggressive", specialty: "career" },
    { id: "jan", name: "ジャン", color: "#ffd339", accent: "#fff3a3", strategy: "chaos", specialty: "chance" },
    { id: "rima", name: "リーマ", color: "#ff7043", accent: "#70e7ff", strategy: "balanced", specialty: "investment" },
    { id: "kento", name: "Kento", color: "#b65cff", accent: "#73e0ff", strategy: "growth", specialty: "technology" },
    { id: "lickey", name: "Lickey", color: "#3287ff", accent: "#f3cc55", strategy: "wealth", specialty: "property" }
  ]);
  const PLAYER_BY_ID = Object.freeze(Object.fromEntries(PLAYERS.map((player) => [player.id, player])));

  const REGIONS = Object.freeze([
    { id: "beginning-town", name: "はじまりの町", theme: "town", color: "#77c96f" },
    { id: "youth-campus", name: "学園・青春街", theme: "campus", color: "#55b9df" },
    { id: "career-city", name: "就職都市", theme: "business", color: "#728ca9" },
    { id: "metropolis", name: "大都会", theme: "metro", color: "#d26988" },
    { id: "resort-coast", name: "リゾート海岸", theme: "coast", color: "#40c7bb" },
    { id: "mountain-frontier", name: "山岳開拓地", theme: "mountain", color: "#a68559" },
    { id: "technology-city", name: "テクノロジー都市", theme: "technology", color: "#875de5" },
    { id: "royal-capital", name: "王国・城下町", theme: "kingdom", color: "#d8aa3c" },
    { id: "space-colony", name: "宇宙コロニー", theme: "space", color: "#526fd4" },
    { id: "six-kings-goal", name: "六王ゴールロード", theme: "finale", color: "#ef5c48" }
  ]);

  const CATEGORY_COUNTS = Object.freeze({
    money: 520,
    job: 100,
    property: 80,
    stock: 80,
    monster: 60,
    equipment: 50,
    city: 40,
    interaction: 30,
    risk: 30,
    checkpoint: 10
  });

  const STOCKS = Object.freeze([
    { id: "tofu-foods", name: "TOFU FOODS", price: 1200, volatility: 0.08 },
    { id: "jan-destiny", name: "JAN DESTINY", price: 980, volatility: 0.18 },
    { id: "eda-arms", name: "EDA ARMS", price: 1450, volatility: 0.13 },
    { id: "rima-energy", name: "RIMA ENERGY", price: 1100, volatility: 0.11 },
    { id: "kento-live", name: "KENTO LIVE", price: 1320, volatility: 0.16 },
    { id: "lickey-kingdom", name: "LICKEY KINGDOM", price: 1700, volatility: 0.1 }
  ]);

  const JOBS = Object.freeze([
    { id: "part-time", name: "街角アルバイト", salary: 45000, rank: 1 },
    { id: "office", name: "会社員", salary: 85000, rank: 2 },
    { id: "chef", name: "人気料理人", salary: 105000, rank: 3 },
    { id: "engineer", name: "未来エンジニア", salary: 130000, rank: 4 },
    { id: "streamer", name: "人気配信者", salary: 145000, rank: 4 },
    { id: "doctor", name: "名医", salary: 175000, rank: 5 },
    { id: "pro-gamer", name: "プロゲーマー", salary: 160000, rank: 5 },
    { id: "trainer", name: "モンスタートレーナー", salary: 150000, rank: 5 },
    { id: "knight", name: "王国騎士団長", salary: 190000, rank: 6 },
    { id: "investor", name: "伝説の投資家", salary: 230000, rank: 7 },
    { id: "mayor", name: "六王都市の市長", salary: 260000, rank: 8 },
    { id: "astronaut", name: "宇宙開拓士", salary: 300000, rank: 9 },
    { id: "unemployed", name: "自由すぎる無職", salary: 0, rank: 0 }
  ]);

  const MONEY_EVENTS = Object.freeze([
    { title: "臨時ボーナス！", detail: "働きぶりが評価され、特別賞与を受け取りました。", min: 60000, max: 240000 },
    { title: "旅行で大散財", detail: "最高の思い出と引き換えに財布が軽くなりました。", min: -260000, max: -70000 },
    { title: "お祝いラッシュ", detail: "人生の節目をみんなが盛大に祝ってくれました。", min: 90000, max: 360000 },
    { title: "突然の修理費", detail: "家電も車も同じ日に壊れる奇跡が起きました。", min: -320000, max: -80000 },
    { title: "副業が大当たり", detail: "思いつきで始めた副業が思わぬ大ヒットです。", min: 120000, max: 520000 },
    { title: "税金の季節", detail: "現実から逃げ切れず、きっちり納めました。", min: -400000, max: -110000 },
    { title: "道端で大発見", detail: "価値のある品を見つけ、正当な謝礼を受け取りました。", min: 40000, max: 180000 },
    { title: "夢への大型投資", detail: "未来の自分へ、思い切った先行投資をしました。", min: -500000, max: -140000 }
  ]);

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

  function hash32(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed) {
    let value = hash32(seed) || 1;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  }

  function seededInt(seed, min, max) {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(seededUnit(seed) * (high - low + 1));
  }

  function deterministicShuffle(values, seed) {
    const output = [...values];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = seededInt(`${seed}:${index}`, 0, index);
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }

  function buildCategoryDeck() {
    const entries = [];
    Object.entries(CATEGORY_COUNTS).forEach(([category, count]) => {
      if (category === "checkpoint") return;
      for (let index = 0; index < count; index += 1) entries.push(category);
    });
    return deterministicShuffle(entries, "six-kings-life-board-v1");
  }

  function spaceTitle(category, number) {
    const titles = {
      money: ["人生イベント", "運命の収支", "暮らしの転機"],
      job: ["キャリアチャンス", "転職の扉", "仕事の転機"],
      property: ["マイホーム計画", "不動産チャンス", "夢の物件"],
      stock: ["マーケット変動", "株式ニュース", "投資チャンス"],
      monster: ["モンスターの縁", "育成ボーナス", "絆の出会い"],
      equipment: ["装備発見", "宝箱出現", "装備ガチャ券"],
      city: ["CITY連携", "都市投資", "街の依頼"],
      interaction: ["六王交流", "プレイヤーイベント", "運命の出会い"],
      risk: ["ハイリスク勝負", "一発逆転", "運命の大勝負"]
    };
    const options = titles[category] || ["人生イベント"];
    return options[number % options.length];
  }

  function generateBoard() {
    const categories = buildCategoryDeck();
    let cursor = 0;
    const spaces = [];
    for (let number = 1; number <= BOARD_SIZE; number += 1) {
      const regionIndex = Math.floor((number - 1) / REGION_SIZE);
      const checkpoint = number % REGION_SIZE === 0;
      const category = checkpoint ? "checkpoint" : categories[cursor++];
      spaces.push(Object.freeze({
        number,
        index: number - 1,
        regionIndex,
        regionId: REGIONS[regionIndex].id,
        category,
        title: checkpoint ? `${REGIONS[regionIndex].name} CHECKPOINT` : spaceTitle(category, number),
        checkpoint
      }));
    }
    return Object.freeze(spaces);
  }

  const BOARD = generateBoard();

  function emptyAssets() {
    return { homes: {}, stocks: {}, equipmentGacha: [], eventHistory: [] };
  }

  function createPlayerState(player, now) {
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      position: 0,
      totalSpaces: 0,
      lap: 0,
      maxSpace: 0,
      rolls: 0,
      cash: STARTING_CASH,
      debt: 0,
      netWorth: STARTING_CASH,
      lifetimeIncome: 0,
      lifetimeExpense: 0,
      job: clone(JOBS[0]),
      paydays: 0,
      assets: emptyAssets(),
      lastRoll: null,
      createdAt: Number(now),
      updatedAt: Number(now)
    };
  }

  function initialMarket(now) {
    return {
      cycle: 0,
      updatedAt: Number(now),
      stocks: Object.fromEntries(STOCKS.map((stock) => [stock.id, { ...stock, previousPrice: stock.price, change: 0 }]))
    };
  }

  function createInitialState(now = Date.now()) {
    const timestamp = Number(now) || Date.now();
    return {
      version: VERSION,
      boardRevision: 1,
      revision: 0,
      players: Object.fromEntries(PLAYERS.map((player) => [player.id, createPlayerState(player, timestamp)])),
      market: initialMarket(timestamp),
      processedOpens: {},
      globalHistory: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function normalizeMap(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function trimMap(value, limit) {
    return Object.fromEntries(Object.entries(normalizeMap(value))
      .sort(([, a], [, b]) => Number(b?.createdAt ?? b) - Number(a?.createdAt ?? a))
      .slice(0, limit));
  }

  function normalizePlayerState(value, definition, now) {
    const initial = createPlayerState(definition, now);
    const player = { ...initial, ...normalizeMap(value) };
    player.id = definition.id;
    player.name = definition.name;
    player.color = definition.color;
    player.position = Math.max(0, Math.min(BOARD_SIZE - 1, Math.trunc(Number(player.position) || 0)));
    player.totalSpaces = Math.max(0, Math.trunc(Number(player.totalSpaces) || 0));
    player.lap = Math.max(0, Math.trunc(Number(player.lap) || Math.floor(player.totalSpaces / BOARD_SIZE)));
    player.maxSpace = Math.max(player.position, Math.trunc(Number(player.maxSpace) || 0));
    player.rolls = Math.max(0, Math.trunc(Number(player.rolls) || 0));
    player.cash = Math.max(0, Math.trunc(Number(player.cash) || 0));
    player.debt = Math.max(0, Math.trunc(Number(player.debt) || 0));
    player.lifetimeIncome = Math.max(0, Math.trunc(Number(player.lifetimeIncome) || 0));
    player.lifetimeExpense = Math.max(0, Math.trunc(Number(player.lifetimeExpense) || 0));
    player.job = JOBS.find((job) => job.id === player.job?.id) || clone(initial.job);
    player.paydays = Math.max(0, Math.trunc(Number(player.paydays) || 0));
    player.assets = { ...emptyAssets(), ...normalizeMap(player.assets) };
    player.assets.homes = normalizeMap(player.assets.homes);
    player.assets.stocks = normalizeMap(player.assets.stocks);
    player.assets.equipmentGacha = Array.isArray(player.assets.equipmentGacha) ? player.assets.equipmentGacha.slice(-100) : [];
    player.assets.eventHistory = Array.isArray(player.assets.eventHistory) ? player.assets.eventHistory.slice(-MAX_HISTORY) : [];
    player.netWorth = player.cash - player.debt;
    player.updatedAt = Number(player.updatedAt) || Number(now);
    return player;
  }

  function normalizeState(value, now = Date.now()) {
    if (!value || Number(value.version) !== VERSION) return createInitialState(now);
    const state = clone(value);
    state.version = VERSION;
    state.boardRevision = 1;
    state.revision = Math.max(0, Math.trunc(Number(state.revision) || 0));
    state.players = normalizeMap(state.players);
    PLAYERS.forEach((player) => {
      state.players[player.id] = normalizePlayerState(state.players[player.id], player, now);
    });
    state.market = { ...initialMarket(now), ...normalizeMap(state.market) };
    state.market.stocks = { ...initialMarket(now).stocks, ...normalizeMap(state.market.stocks) };
    state.processedOpens = trimMap(state.processedOpens, MAX_PROCESSED_OPENS);
    state.globalHistory = trimMap(state.globalHistory, MAX_HISTORY);
    state.createdAt = Number(state.createdAt) || Number(now);
    state.updatedAt = Number(state.updatedAt) || Number(now);
    return state;
  }

  function applyMoney(player, amount) {
    const delta = Math.trunc(Number(amount) || 0);
    if (delta >= 0) {
      const repayment = Math.min(player.debt, delta);
      player.debt -= repayment;
      player.cash += delta - repayment;
      player.lifetimeIncome += delta;
    } else {
      const expense = Math.abs(delta);
      const paid = Math.min(player.cash, expense);
      player.cash -= paid;
      player.debt += expense - paid;
      player.lifetimeExpense += expense;
    }
    player.netWorth = player.cash - player.debt;
    return delta;
  }

  function moneyEvent(player, seed) {
    const definition = MONEY_EVENTS[seededInt(`${seed}:event`, 0, MONEY_EVENTS.length - 1)];
    const low = Math.min(definition.min, definition.max);
    const high = Math.max(definition.min, definition.max);
    let amount = seededInt(`${seed}:amount`, low, high);
    if (PLAYER_BY_ID[player.id]?.specialty === "chance") amount = Math.round(amount * 1.15);
    applyMoney(player, amount);
    return { type: "money", title: definition.title, detail: definition.detail, amount };
  }

  function placeholderEvent(player, space, seed) {
    const rewards = {
      job: [25000, 85000], property: [-90000, 140000], stock: [-120000, 180000],
      monster: [10000, 50000], equipment: [15000, 70000], city: [20000, 90000],
      interaction: [-50000, 90000], risk: [-350000, 500000]
    };
    const range = rewards[space.category] || [-20000, 40000];
    const amount = seededInt(`${seed}:${space.category}`, range[0], range[1]);
    applyMoney(player, amount);
    return {
      type: space.category,
      title: space.title,
      detail: `${REGIONS[space.regionIndex].name}で新しい人生イベントが発生しました。`,
      amount
    };
  }

  function checkpointGachaCount(player) {
    const worth = player.cash - player.debt;
    if (worth < 0) return 1;
    if (worth < 500000) return 2;
    if (worth < 2000000) return 3;
    if (worth < 10000000) return 5;
    return 8;
  }

  function checkpointEvent(player, space, seed, now) {
    const count = checkpointGachaCount(player);
    const record = {
      id: `gacha-${seed}-${space.number}`,
      checkpoint: space.number,
      count,
      status: "pending",
      createdAt: Number(now)
    };
    player.assets.equipmentGacha.push(record);
    player.assets.equipmentGacha = player.assets.equipmentGacha.slice(-100);
    return {
      type: "checkpoint",
      title: `${REGIONS[space.regionIndex].name} 到達！`,
      detail: `所持金ランクにより装備ガチャを${count}回獲得しました。`,
      amount: 0,
      equipmentDraws: count
    };
  }

  function addEvent(state, player, rollId, space, event, now) {
    const id = `${rollId}:${space.number}:${event.type}`;
    const entry = {
      id,
      playerId: player.id,
      playerName: player.name,
      space: space.number,
      regionId: space.regionId,
      category: event.type,
      title: event.title,
      detail: event.detail,
      amount: Number(event.amount) || 0,
      equipmentDraws: Number(event.equipmentDraws) || 0,
      createdAt: Number(now)
    };
    player.assets.eventHistory.push(entry);
    player.assets.eventHistory = player.assets.eventHistory.slice(-MAX_HISTORY);
    state.globalHistory[id] = entry;
    return entry;
  }

  function crossedCheckpoints(totalBefore, totalAfter) {
    const output = [];
    const first = Math.floor(totalBefore / REGION_SIZE) + 1;
    const last = Math.floor(totalAfter / REGION_SIZE);
    for (let checkpointIndex = first; checkpointIndex <= last; checkpointIndex += 1) {
      const boardNumber = ((checkpointIndex * REGION_SIZE - 1) % BOARD_SIZE) + 1;
      output.push(BOARD[boardNumber - 1]);
    }
    return output;
  }

  function applyOpenRoll(value, payload = {}, now = Date.now()) {
    const state = normalizeState(value, now);
    if (payload.testMode) return { state, applied: false, testMode: true };
    const openId = String(payload.id || "").trim();
    if (!openId) return { state, applied: false, error: "OPEN IDがありません。" };
    if (state.processedOpens[openId]) return { state, applied: false, duplicate: true };
    const definition = playerForName(payload.playerName);
    if (!definition) return { state, applied: false, ignored: true, error: "固定メンバーではありません。" };
    const player = state.players[definition.id];
    const die = seededInt(`${openId}:${definition.id}:die`, 1, 6);
    const totalBefore = player.totalSpaces;
    const totalAfter = totalBefore + die;
    const position = totalAfter % BOARD_SIZE;
    const landing = BOARD[position === 0 ? BOARD_SIZE - 1 : position - 1];
    const events = [];

    crossedCheckpoints(totalBefore, totalAfter).forEach((space) => {
      events.push(addEvent(state, player, openId, space, checkpointEvent(player, space, openId, now), now));
    });
    if (!landing.checkpoint) {
      const event = landing.category === "money"
        ? moneyEvent(player, `${openId}:${landing.number}`)
        : placeholderEvent(player, landing, `${openId}:${landing.number}`);
      events.push(addEvent(state, player, openId, landing, event, now));
    }

    player.totalSpaces = totalAfter;
    player.position = position;
    player.lap = Math.floor(totalAfter / BOARD_SIZE);
    player.maxSpace = Math.max(player.maxSpace, Math.min(BOARD_SIZE, totalAfter));
    player.rolls += 1;
    player.lastRoll = {
      id: openId,
      die,
      from: totalBefore % BOARD_SIZE,
      to: position,
      landingSpace: landing.number,
      matchId: String(payload.matchId || ""),
      characterId: Number(payload.characterId) || null,
      team: payload.team === "red" || payload.team === "blue" ? payload.team : "",
      createdAt: Number(now)
    };
    player.updatedAt = Number(now);
    player.netWorth = player.cash - player.debt;
    state.processedOpens[openId] = { playerId: player.id, createdAt: Number(now) };
    state.processedOpens = trimMap(state.processedOpens, MAX_PROCESSED_OPENS);
    state.globalHistory = trimMap(state.globalHistory, MAX_HISTORY);
    state.revision += 1;
    state.updatedAt = Number(now);
    return { state, applied: true, playerId: player.id, die, landing, events };
  }

  function buildOpenId(payload = {}) {
    const matchId = String(payload.matchId || "").trim();
    const player = playerForName(payload.playerName);
    const team = payload.team === "red" || payload.team === "blue" ? payload.team : "team";
    const cellIndex = Number.isInteger(Number(payload.cellIndex)) ? Number(payload.cellIndex) : -1;
    if (!matchId || !player || cellIndex < 0) return "";
    return `life-open:${matchId}:${team}:${cellIndex}:${player.id}`;
  }

  function boardCategoryCounts(board = BOARD) {
    return board.reduce((counts, space) => {
      counts[space.category] = (counts[space.category] || 0) + 1;
      return counts;
    }, {});
  }

  const api = {
    VERSION, BOARD_SIZE, REGION_SIZE, MAX_HISTORY, MAX_PROCESSED_OPENS, STARTING_CASH,
    PLAYERS, PLAYER_BY_ID, REGIONS, CATEGORY_COUNTS, STOCKS, JOBS, MONEY_EVENTS, BOARD,
    clone, playerKey, playerForName, hash32, seededUnit, seededInt, deterministicShuffle,
    generateBoard, boardCategoryCounts, createInitialState, normalizeState, checkpointGachaCount,
    applyMoney, applyOpenRoll, buildOpenId
  };

  global.TeamBingoLifeBoardSystem = api;
})(typeof window !== "undefined" ? window : globalThis);
